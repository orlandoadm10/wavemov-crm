"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { PublicInstance } from "@/lib/services/whatsapp";
import { Check, Copy, Plug, PlugZap, Power, QrCode, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InstanceSettings({
  organizationId,
  instance,
  webhookUrl,
}: {
  organizationId: string;
  instance: PublicInstance;
  webhookUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(instance?.name ?? "Principal");
  const [baseUrl, setBaseUrl] = useState(instance?.base_url ?? "");
  // Id da instância: apenas informativo, preenchido automaticamente pela
  // API ao testar a conexão — a UAZAPI não exige (nem expõe) esse campo
  // como algo a ser digitado; o token já identifica a instância.
  const [instanceId, setInstanceId] = useState(instance?.instance_id ?? "");
  const [token, setToken] = useState("");
  const [qr, setQr] = useState<string | null>(instance?.qr_code ?? null);
  const [status, setStatus] = useState(instance?.status ?? "disconnected");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function callAction(action: string, config?: Record<string, string>) {
    setBusy(action);
    setMessage(null);
    const res = await fetch("/api/uazapi/instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: organizationId, action, config }),
    });
    const body = await res.json().catch(() => null);
    setBusy(null);

    if (!res.ok) {
      setMessage({ type: "error", text: body?.error ?? "Erro na operação." });
      return null;
    }
    return body;
  }

  async function save() {
    if (!baseUrl || (!token && !instance?.has_token)) {
      setMessage({ type: "error", text: "Preencha URL base e Token." });
      return;
    }
    const body = await callAction("save", {
      name,
      base_url: baseUrl,
      token: token || "__unchanged__",
    });
    if (body?.ok) {
      setToken("");
      setMessage({ type: "ok", text: "Configuração salva com sucesso." });
      router.refresh();
    }
  }

  async function testConnection() {
    const body = await callAction("status");
    if (body?.ok) {
      setStatus(body.status);
      if (body.qr) setQr(body.qr);
      if (body.instanceId) setInstanceId(body.instanceId);
      setMessage({
        type: body.status === "connected" ? "ok" : "error",
        text:
          body.status === "connected"
            ? "Instância conectada e funcionando! ✅"
            : `Status atual: ${body.status}. Verifique a conexão.`,
      });
    }
  }

  async function generateQr() {
    const body = await callAction("qr");
    if (body?.qr) {
      setQr(body.qr);
      setStatus("qr");
      setMessage({ type: "ok", text: "QR Code gerado. Escaneie com o WhatsApp." });
    } else if (body) {
      setMessage({
        type: "error",
        text: "QR não retornado — a instância pode já estar conectada.",
      });
    }
  }

  async function copyWebhook() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusMeta: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
    connected: { label: "Conectado", tone: "green" },
    connecting: { label: "Conectando…", tone: "amber" },
    qr: { label: "Aguardando QR", tone: "amber" },
    disconnected: { label: "Desconectado", tone: "slate" },
    error: { label: "Erro", tone: "red" },
  };
  const st = statusMeta[status] ?? statusMeta.disconnected;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Configuração */}
      <Card>
        <CardHeader
          title="Credenciais UAZAPI"
          subtitle="Dados da sua instância — o token fica seguro no servidor"
        />
        <div className="space-y-4 p-5">
          <Field label="Nome da conexão">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="URL base da UAZAPI">
            <Input
              placeholder="https://sua-instancia.uazapi.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>
          <Field label={instance?.has_token ? "Token (deixe vazio para manter o atual)" : "Token"}>
            <Input
              type="password"
              placeholder={instance?.has_token ? "••••••••  (salvo)" : "Token da UAZAPI"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>
          <p className="text-xs text-ink-faint">
            Não existe "Instance ID" para configurar — o token já identifica
            sua instância. Depois de salvar, use <b>Testar conexão</b> para
            confirmar que os dados estão corretos.
          </p>

          {message && (
            <p
              className={
                message.type === "ok"
                  ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                  : "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              }
            >
              {message.text}
            </p>
          )}

          <Button onClick={save} loading={busy === "save"} className="w-full">
            <Save className="h-4 w-4" />
            Salvar configuração
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        {/* Status e ações */}
        <Card>
          <CardHeader
            title="Status da instância"
            subtitle={instanceId ? `ID informado pela API: ${instanceId}` : undefined}
            action={<Badge tone={st.tone} dot>{st.label}</Badge>}
          />
          <div className="grid grid-cols-2 gap-2 p-5">
            <Button variant="outline" onClick={testConnection} loading={busy === "status"}>
              <PlugZap className="h-4 w-4 text-primary-600" />
              Testar conexão
            </Button>
            <Button variant="outline" onClick={() => callAction("connect")} loading={busy === "connect"}>
              <Plug className="h-4 w-4 text-emerald-600" />
              Conectar
            </Button>
            <Button variant="outline" onClick={generateQr} loading={busy === "qr"}>
              <QrCode className="h-4 w-4 text-ink" />
              Gerar QR Code
            </Button>
            <Button variant="outline" onClick={() => callAction("restart")} loading={busy === "restart"}>
              <RefreshCw className="h-4 w-4 text-amber-600" />
              Reiniciar
            </Button>
            <Button
              variant="outline"
              className="col-span-2 text-rose-600 hover:border-rose-200"
              onClick={() => callAction("disconnect")}
              loading={busy === "disconnect"}
            >
              <Power className="h-4 w-4" />
              Desconectar
            </Button>
          </div>

          {qr && status !== "connected" && (
            <div className="flex flex-col items-center border-t border-line p-5">
              <p className="mb-3 text-xs text-ink-faint">
                Abra o WhatsApp → Aparelhos conectados → Conectar aparelho
              </p>
              {/* QR pode vir como base64 ou string de QR */}
              {qr.startsWith("data:image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR Code" className="h-52 w-52 rounded-xl border border-line" />
              ) : (
                <p className="max-w-full rounded-xl bg-slate-50 p-3 font-mono text-[10px] break-all text-ink-soft">
                  {qr}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader
            title="Webhook de mensagens"
            subtitle="Configure esta URL na sua instância UAZAPI"
          />
          <div className="p-5">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-ink-soft ring-1 ring-line">
                {webhookUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyWebhook} aria-label="Copiar">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ol className="mt-4 list-decimal space-y-1.5 pl-4 text-xs text-ink-soft">
              <li>No painel da UAZAPI, acesse as configurações de <b>Webhook</b> da instância.</li>
              <li>Cole a URL acima no campo de webhook de <b>mensagens recebidas</b>.</li>
              <li>
                Defina <code className="rounded bg-slate-100 px-1">UAZAPI_WEBHOOK_SECRET</code> no
                seu <code className="rounded bg-slate-100 px-1">.env.local</code> com o mesmo
                segredo usado na URL.
              </li>
              <li>Envie uma mensagem de teste para o número conectado — a conversa aparece em Atendimento.</li>
            </ol>
          </div>
        </Card>
      </div>
    </div>
  );
}
