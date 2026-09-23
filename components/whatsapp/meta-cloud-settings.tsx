"use client";

// Cadastro da instância da API oficial da Meta (WhatsApp Cloud API).
// O token de acesso nunca volta para a tela: "__unchanged__" mantém o salvo.
import { saveMetaInstanceAction } from "@/app/(dashboard)/atendimento/configuracoes/actions";
import { CopyField } from "@/components/integrations/copy-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface PublicMetaInstance {
  name: string;
  phone_number_id: string | null;
  business_account_id: string | null;
  display_phone: string | null;
  has_token: boolean;
  status: string;
}

export function MetaCloudSettings({
  instance,
  callbackUrl,
  verifyToken,
  canManage,
}: {
  instance: PublicMetaInstance | null;
  callbackUrl: string;
  verifyToken: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: instance?.name ?? "WhatsApp oficial",
    phone_number_id: instance?.phone_number_id ?? "",
    business_account_id: instance?.business_account_id ?? "",
    display_phone: instance?.display_phone ?? "",
    access_token: instance?.has_token ? "__unchanged__" : "",
  });
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await saveMetaInstanceAction(form);
      setFeedback(result);
      if (!result.error) router.refresh();
    });
  }

  return (
    <Card className="mt-6">
      <CardHeader
        title="API oficial da Meta (WhatsApp Cloud API)"
        subtitle="Número oficial, templates aprovados e sem risco de bloqueio por automação"
        action={
          instance ? (
            <Badge tone="green" dot>
              Configurada
            </Badge>
          ) : (
            <Badge tone="slate">Opcional</Badge>
          )
        }
      />
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Field label="Nome do número">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Telefone exibido">
          <Input
            value={form.display_phone}
            onChange={(e) => setForm({ ...form, display_phone: e.target.value })}
            placeholder="+55 11 90000-0000"
          />
        </Field>
        <Field label="Phone Number ID">
          <Input
            inputMode="numeric"
            value={form.phone_number_id}
            onChange={(e) => setForm({ ...form, phone_number_id: e.target.value.trim() })}
            required
          />
        </Field>
        <Field label="WhatsApp Business Account ID">
          <Input
            inputMode="numeric"
            value={form.business_account_id}
            onChange={(e) => setForm({ ...form, business_account_id: e.target.value.trim() })}
          />
        </Field>
        <Field label="Token de acesso (permanente)" className="sm:col-span-2">
          <Input
            type="password"
            autoComplete="off"
            value={form.access_token === "__unchanged__" ? "" : form.access_token}
            placeholder={form.access_token === "__unchanged__" ? "•••••••• (salvo — deixe em branco para manter)" : "EAAG…"}
            onChange={(e) => setForm({ ...form, access_token: e.target.value || (instance?.has_token ? "__unchanged__" : "") })}
          />
        </Field>

        {instance && (
          <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
            <CopyField label="URL de callback (painel da Meta)" value={callbackUrl} />
            {verifyToken && <CopyField label="Token de verificação" value={verifyToken} />}
          </div>
        )}

        {feedback?.error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{feedback.error}</p>
        )}
        {feedback?.success && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 sm:col-span-2">{feedback.success}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-ink-faint">
            No painel da Meta, assine o campo <code>messages</code>. O servidor precisa da variável{" "}
            <code>META_APP_SECRET</code> para validar as mensagens recebidas.
          </p>
          <Button type="submit" loading={pending}>
            Salvar API oficial
          </Button>
        </div>
      </form>
    </Card>
  );
}
