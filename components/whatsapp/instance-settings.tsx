"use client";

import { rotateWebhookSecretAction } from "@/app/(dashboard)/atendimento/configuracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import type { PublicInstance } from "@/lib/services/whatsapp";
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  Plug,
  PlugZap,
  Power,
  QrCode,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function InstanceSettings({
  organizationId,
  instance,
  webhookUrl,
  canManageWebhook,
}: {
  organizationId: string;
  instance: PublicInstance;
  // `null` quando quem abriu a tela não é administrador da empresa ou quando
  // a instância ainda não tem segredo: a URL carrega o segredo do webhook e
  // nunca é montada "só para esconder no CSS".
  webhookUrl: string | null;
  canManageWebhook: boolean;
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
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);
  const [rotating, startRotate] = useTransition();

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
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // A organização vai pela sessão do servidor dentro da action — nada de
  // `organization_id` saindo do navegador para uma operação de segredo.
  function rotateSecret() {
    setConfirmRotate(false);
    setWebhookMessage(null);
    startRotate(async () => {
      const result = await rotateWebhookSecretAction();
      if (result.error) {
        setWebhookMessage({ type: "error", text: result.error });
        return;
      }
      setWebhookMessage({ type: "ok", text: result.success ?? "Segredo gerado." });
      router.refresh();
    });
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
                  ? "rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text"
                  : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
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
          <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
            <Button variant="outline" onClick={testConnection} loading={busy === "status"}>
              <PlugZap className="h-4 w-4 text-primary-600" />
              Testar conexão
            </Button>
            <Button variant="outline" onClick={() => callAction("connect")} loading={busy === "connect"}>
              <Plug className="h-4 w-4 text-success-text" />
              Conectar
            </Button>
            <Button variant="outline" onClick={generateQr} loading={busy === "qr"}>
              <QrCode className="h-4 w-4 text-ink" />
              Gerar QR Code
            </Button>
            <Button variant="outline" onClick={() => callAction("restart")} loading={busy === "restart"}>
              <RefreshCw className="h-4 w-4 text-warning-text" />
              Reiniciar
            </Button>
            <Button
              variant="outline"
              className="col-span-2 text-destructive-text hover:border-destructive/35"
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
                <p className="max-w-full rounded-xl bg-muted/50 p-3 font-mono text-[10px] break-all text-ink-soft">
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
          <div className="space-y-4 p-5">
            {!canManageWebhook ? (
              <div className="flex gap-3 rounded-lg bg-muted/50 p-4 ring-1 ring-line">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <p className="text-xs leading-relaxed text-ink-soft">
                  A URL do webhook carrega o <b>segredo que autentica as mensagens
                  desta instância</b> — quem tem o segredo consegue criar contatos e
                  leads aqui dentro. Por isso ela fica restrita ao administrador da
                  empresa. Peça a ele para configurar a UAZAPI.
                </p>
              </div>
            ) : !webhookUrl ? (
              <>
                <div className="flex gap-3 rounded-lg bg-warning/10 p-4">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                  <p className="text-xs leading-relaxed text-warning-text">
                    Esta empresa ainda não tem segredo próprio de webhook. Gere um
                    para receber mensagens com uma URL exclusiva desta conta.
                  </p>
                </div>
                <Button onClick={rotateSecret} loading={rotating} className="w-full">
                  <KeyRound className="h-4 w-4" />
                  Gerar URL do webhook
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-ink-soft ring-1 ring-line">
                    {webhookUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyWebhook} aria-label="Copiar">
                    {copied ? <Check className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <ol className="list-decimal space-y-1.5 pl-4 text-xs text-ink-soft">
                  <li>No painel da UAZAPI, acesse as configurações de <b>Webhook</b> da instância.</li>
                  <li>Cole a URL acima no campo de webhook de <b>mensagens recebidas</b>.</li>
                  <li>
                    O segredo já vem na URL e vale <b>só para esta instância</b> — não
                    precisa configurar nada no <code className="rounded bg-muted px-1">.env</code>.
                    Trate a URL como senha.
                  </li>
                  <li>Envie uma mensagem de teste para o número conectado — a conversa aparece em Atendimento.</li>
                </ol>

                <div className="border-t border-line pt-4">
                  {confirmRotate ? (
                    <div className="rounded-lg bg-destructive/10 p-3">
                      <p className="text-xs leading-relaxed text-destructive-text">
                        Gerar um segredo novo <b>invalida a URL atual na hora</b>. As
                        mensagens param de chegar até você colar a URL nova no painel
                        da UAZAPI. Continuar?
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={rotateSecret} loading={rotating}>
                          Sim, gerar novo segredo
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmRotate(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setConfirmRotate(true)}
                      disabled={rotating}
                    >
                      <KeyRound className="h-4 w-4 text-ink-soft" />
                      Gerar novo segredo
                    </Button>
                  )}
                </div>
              </>
            )}

            {webhookMessage && (
              <p
                className={
                  webhookMessage.type === "ok"
                    ? "rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text"
                    : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
                }
              >
                {webhookMessage.text}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
