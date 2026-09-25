"use client";

import { rotateIngestSecretAction } from "@/app/(dashboard)/formularios/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Check, Copy, Eye, EyeOff, KeyRound, Plug, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface ConnectedForm {
  id: string;
  name: string;
  externalId: string;
  isActive: boolean;
  /**
   * Saúde da entrada deste fluxo, já resolvida no servidor.
   *
   * Vem pronta em vez de o painel calcular: a regra vive em
   * `lib/features/lead-ingestion/domain/ingestion-health.ts`, é testada lá, e
   * este arquivo é Client Component — recalcular aqui levaria a regra para o
   * bundle e abriria a porta para as duas cópias divergirem.
   */
  health: { tone: "green" | "amber" | "red" | "slate"; label: string };
}

/**
 * Painel de ingestão externa de leads (n8n) — restrito a `org_admin`.
 *
 * A página só renderiza este componente para quem administra a empresa, e a
 * credencial nem é lida do banco para os demais: quem a tem cria contato e
 * negociação em qualquer formulário desta organização.
 */
export function ExternalIngestPanel({
  endpoint,
  secret,
  connectedForms,
}: {
  endpoint: string;
  secret: string | null;
  connectedForms: ConnectedForm[];
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [rotating, startRotate] = useTransition();

  // `navigator.clipboard` rejeita em contexto não seguro (http em rede local,
  // por exemplo). Sem o catch, o clique não dava retorno nenhum e o operador
  // ficava achando que copiou.
  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setMessage({
        type: "error",
        text: "O navegador bloqueou a cópia. Selecione o texto e copie manualmente.",
      });
    }
  }

  // A organização vai pela sessão do servidor dentro da action — nada de
  // `organization_id` saindo do navegador numa operação de credencial.
  function rotate() {
    setConfirmRotate(false);
    setMessage(null);
    startRotate(async () => {
      const result = await rotateIngestSecretAction();
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setRevealed(true);
      setMessage({ type: "ok", text: result.success ?? "Credencial gerada." });
      router.refresh();
    });
  }

  const exampleId = connectedForms[0]?.externalId ?? "id-do-formulario";
  const exampleBody = `{
  "form_external_id": "${exampleId}",
  "event_id": "{{ $json.leadgen_id }}",
  "data": { "name": "…", "email": "…", "phone": "…" }
}`;

  return (
    <Card>
      <CardHeader
        title="Ingestão externa de leads (n8n)"
        subtitle="Receba leads de outros sistemas direto no funil, sem passar pela página pública"
        action={<Plug className="h-4 w-4 text-ink-faint" />}
      />

      <div className="space-y-4 p-5">
        <p className="rounded-lg bg-primary-50 px-4 py-3 text-xs leading-relaxed text-primary-800">
          Vai ligar Typeform, o formulário do site ou outra ferramenta? Use{" "}
          <Link href="/fontes" className="font-semibold underline hover:text-primary-900">
            Fontes de lead
          </Link>
          : a conexão é direta, sem fluxo no n8n. Este painel continua valendo para os fluxos que já existem.
        </p>
        <div className="flex gap-3 rounded-lg bg-muted/50 p-4 ring-1 ring-line">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
          <p className="text-xs leading-relaxed text-ink-soft">
            A credencial abaixo vale para <b>toda esta empresa</b>: quem a tem cria contato
            e negociação em qualquer formulário daqui. Trate-a como senha e só a cole no
            fluxo do n8n. Cada formulário continua sendo escolhido pelo{" "}
            <b>identificador de integração</b> dele, definido no próprio formulário.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Endpoint</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-ink-soft ring-1 ring-line">
              POST {endpoint}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copy(endpoint, "endpoint")}
              aria-label="Copiar endpoint"
            >
              {copied === "endpoint" ? (
                <Check className="h-4 w-4 text-success-text" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">
            A URL é a mesma para todos os fluxos. O que muda é o cabeçalho{" "}
            <code className="rounded bg-muted px-1">x-webhook-secret</code> e o
            identificador no corpo.
          </p>
        </div>

        {!secret ? (
          <>
            <div className="flex gap-3 rounded-lg bg-warning/10 p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
              <p className="text-xs leading-relaxed text-warning-text">
                Esta empresa ainda não tem credencial de integração. Gere uma para começar
                a receber leads pelo n8n.
              </p>
            </div>
            <Button onClick={rotate} loading={rotating} className="w-full">
              <KeyRound className="h-4 w-4" />
              Gerar credencial
            </Button>
          </>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">
                Cabeçalho <code className="rounded bg-muted px-1">x-webhook-secret</code>
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs text-ink-soft ring-1 ring-line">
                  {revealed ? secret : "•".repeat(48)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRevealed((v) => !v)}
                  aria-label={revealed ? "Ocultar credencial" : "Revelar credencial"}
                >
                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(secret, "secret")}
                  aria-label="Copiar credencial"
                >
                  {copied === "secret" ? (
                    <Check className="h-4 w-4 text-success-text" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Corpo da requisição</p>
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
                {exampleBody}
              </pre>
              <ul className="mt-2 space-y-1 text-xs text-ink-faint">
                <li>
                  <b>form_external_id</b> — identificador de integração do formulário que
                  recebe o lead.
                </li>
                <li>
                  <b>event_id</b> — identificador do evento na origem. É ele que evita lead
                  repetido quando o fluxo reentrega: a segunda chamada com o mesmo par
                  formulário + evento responde <code className="rounded bg-muted px-1">duplicate</code> e
                  não cria nada.
                </li>
                <li>
                  <b>data</b> — os campos do lead. Chaves que não existem no formulário são
                  ignoradas; funil e etapa são sempre os configurados aqui no CRM.
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">
                Formulários conectados
              </p>
              {connectedForms.length === 0 ? (
                <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-ink-faint ring-1 ring-line">
                  Nenhum formulário tem identificador de integração ainda. Edite um
                  formulário e preencha o campo <b>Identificador de integração</b> para
                  ligá-lo a um fluxo do n8n.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                  {connectedForms.map((form) => (
                    <li key={form.id} className="flex items-center gap-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">{form.name}</span>
                      <code className="truncate font-mono text-xs text-ink-soft">
                        {form.externalId}
                      </code>
                      {!form.isActive && <Badge tone="slate">Inativo</Badge>}
                      {/* A pergunta desta lista é mais fina que a do banner:
                          não é "a integração está viva", é QUAL fluxo parou. */}
                      <Badge tone={form.health.tone}>{form.health.label}</Badge>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copy(form.externalId, form.id)}
                        aria-label={`Copiar identificador de ${form.name}`}
                      >
                        {copied === form.id ? (
                          <Check className="h-4 w-4 text-success-text" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {connectedForms.some((f) => !f.isActive) && (
                <p className="mt-1.5 text-xs text-ink-faint">
                  Formulário inativo recusa a chamada do n8n com <b>404</b>, igual a um
                  identificador inexistente.
                </p>
              )}
            </div>

            <div className="border-t border-line pt-4">
              {confirmRotate ? (
                <div className="rounded-lg bg-destructive/10 p-3">
                  <p className="text-xs leading-relaxed text-destructive-text">
                    Gerar uma credencial nova <b>invalida a atual na hora</b>. Todos os
                    fluxos n8n desta empresa param de entregar lead até você colar o valor
                    novo em cada um deles. Continuar?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={rotate} loading={rotating}>
                      Sim, gerar credencial nova
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
                  <KeyRound className="h-4 w-4" />
                  Gerar credencial nova
                </Button>
              )}
            </div>
          </>
        )}

        {message && (
          <p
            role={message.type === "error" ? "alert" : undefined}
            className={
              message.type === "ok"
                ? "rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text"
                : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </Card>
  );
}
