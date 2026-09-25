"use client";

import { createApiTokenAction, revokeApiTokenAction } from "@/app/(dashboard)/integracoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { ApiToken } from "@/types";
import { KeyRound, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyField } from "./copy-field";

function tokenState(token: ApiToken): { tone: "green" | "red" | "slate"; label: string } {
  if (token.revoked_at) return { tone: "red", label: "Revogado" };
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) return { tone: "slate", label: "Expirado" };
  return { tone: "green", label: "Ativo" };
}

export function ApiTokensPanel({ tokens }: { tokens: ApiToken[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"both" | "api" | "mcp">("both");
  const [expires, setExpires] = useState("0");
  const [created, setCreated] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);
  const [pending, startTransition] = useTransition();

  function openForm() {
    setName("");
    setScope("both");
    setExpires("0");
    setCreated(null);
    setFormError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await createApiTokenAction({
        name,
        scopes: scope === "both" ? ["api", "mcp"] : [scope],
        expiresInDays: Number(expires),
      });
      if (result.error || !result.token) {
        setFormError(result.error ?? "Não foi possível criar o token.");
        return;
      }
      setCreated(result.token);
      router.refresh();
    });
  }

  function revoke() {
    const token = revoking;
    setRevoking(null);
    if (!token) return;
    startTransition(async () => {
      const result = await revokeApiTokenAction(token.id);
      setFeedback(result);
      if (!result.error) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Tokens de API"
        subtitle="Cada token só acessa os dados desta empresa. O valor aparece uma única vez."
        action={
          <Button size="sm" onClick={openForm}>
            <Plus className="h-3.5 w-3.5" /> Criar token
          </Button>
        }
      />
      <div className="p-5">
        {feedback?.error && <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{feedback.error}</p>}
        {feedback?.success && (
          <p className="mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">{feedback.success}</p>
        )}
        {tokens.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ink-faint">
            <KeyRound className="h-4 w-4" /> Nenhum token criado ainda.
          </p>
        ) : (
          <DataTable className="shadow-none">
            <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              <tr>
                <th className="px-5 py-3.5">Nome</th>
                <th className="px-5 py-3.5">Prefixo</th>
                <th className="px-5 py-3.5">Uso</th>
                <th className="px-5 py-3.5">Situação</th>
                <th className="px-5 py-3.5">Último uso</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tokens.map((token) => {
                const state = tokenState(token);
                return (
                  <tr key={token.id}>
                    <td className="px-5 py-3.5 font-medium text-ink">{token.name}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-ink-soft">{token.token_prefix}…</td>
                    <td className="px-5 py-3.5 text-ink-soft">{token.scopes.map((s) => s.toUpperCase()).join(" + ")}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={state.tone} dot>
                        {state.label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                      {token.last_used_at ? formatDateTime(token.last_used_at) : "Nunca"}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {!token.revoked_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:bg-destructive/10 hover:text-destructive-text"
                          onClick={() => setRevoking(token)}
                        >
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} size="md" title="Criar token de API" subtitle="Para n8n, sistemas externos e clientes MCP">
        {created ? (
          <div className="space-y-4">
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-text">
              Copie o token agora. Por segurança ele não será exibido de novo.
            </p>
            <CopyField label="Token" value={created} />
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome">
              <Input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="n8n produção" required />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Uso">
                <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
                  <option value="both">API REST e MCP</option>
                  <option value="api">Somente API REST</option>
                  <option value="mcp">Somente MCP</option>
                </Select>
              </Field>
              <Field label="Validade">
                <Select value={expires} onChange={(e) => setExpires(e.target.value)}>
                  <option value="0">Sem expiração</option>
                  <option value="30">30 dias</option>
                  <option value="90">90 dias</option>
                  <option value="365">1 ano</option>
                </Select>
              </Field>
            </div>
            {formError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={pending}>
                Criar token
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        danger
        title="Revogar token"
        description={`Integrações que usam "${revoking?.name ?? ""}" param de funcionar imediatamente.`}
        confirmLabel="Revogar"
      />
    </Card>
  );
}
