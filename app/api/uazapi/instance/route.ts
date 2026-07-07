import {
  connectInstance,
  disconnectInstance,
  getInstanceStatus,
  getQrCode,
  restartInstance,
} from "@/lib/services/uazapi";
import { getInstanceForOrg, resolveConfig, toPublicInstance } from "@/lib/services/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { whatsappInstanceSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { z } from "zod";

const actionSchema = z.object({
  organization_id: z.string().uuid(),
  action: z.enum(["save", "status", "connect", "disconnect", "restart", "qr"]),
  config: whatsappInstanceSchema.partial().optional(),
});

// Todas as ações da instância WhatsApp passam por aqui (server-side).
// O token nunca chega ao navegador.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  const { organization_id, action, config } = parsed.data;

  // Permissão: precisa poder escrever na organização
  const supabase = await createClient();
  const { data: canWrite } = await supabase.rpc("has_org_write", { org_id: organization_id });
  if (!canWrite) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const admin = createAdminClient();
  let instance = await getInstanceForOrg(organization_id);

  if (action === "save") {
    const saveParsed = whatsappInstanceSchema.safeParse(config);
    if (!saveParsed.success) {
      return NextResponse.json(
        { error: saveParsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const c = saveParsed.data;
    // "__unchanged__" = manter o token já salvo (nunca exibido ao cliente)
    const keepToken = c.token === "__unchanged__" && instance?.token_encrypted;
    const payload = {
      organization_id,
      name: c.name,
      base_url: c.base_url,
      instance_id: c.instance_id,
      token_encrypted: keepToken ? instance!.token_encrypted : c.token,
    };
    if (instance) {
      await admin.from("whatsapp_instances").update(payload).eq("id", instance.id);
    } else {
      await admin.from("whatsapp_instances").insert(payload);
    }
    instance = await getInstanceForOrg(organization_id);
    return NextResponse.json({ ok: true, instance: toPublicInstance(instance) });
  }

  const uazapiConfig = resolveConfig(instance);
  if (!uazapiConfig) {
    return NextResponse.json(
      { error: "Configure a URL base, o token e o Instance ID primeiro." },
      { status: 400 }
    );
  }

  if (action === "status") {
    const status = await getInstanceStatus(uazapiConfig);
    if (instance) {
      await admin
        .from("whatsapp_instances")
        .update({
          status: status.status,
          qr_code: status.qrCode ?? null,
          ...(status.status === "connected"
            ? { last_connected_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", instance.id);
    }
    return NextResponse.json({ ok: true, status: status.status, qr: status.qrCode ?? null });
  }

  if (action === "qr") {
    const qr = await getQrCode(uazapiConfig);
    if (instance && qr) {
      await admin
        .from("whatsapp_instances")
        .update({ status: "qr", qr_code: qr })
        .eq("id", instance.id);
    }
    return NextResponse.json({ ok: Boolean(qr), qr });
  }

  if (action === "connect") {
    const res = await connectInstance(uazapiConfig);
    if (instance) {
      await admin
        .from("whatsapp_instances")
        .update({ status: res.ok ? "connecting" : "error" })
        .eq("id", instance.id);
    }
    return NextResponse.json({ ok: res.ok, data: res.data });
  }

  if (action === "disconnect") {
    const res = await disconnectInstance(uazapiConfig);
    if (instance) {
      await admin
        .from("whatsapp_instances")
        .update({ status: "disconnected", qr_code: null })
        .eq("id", instance.id);
    }
    return NextResponse.json({ ok: res.ok });
  }

  if (action === "restart") {
    const res = await restartInstance(uazapiConfig);
    return NextResponse.json({ ok: res.ok, data: res.data });
  }

  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
}
