"use client";

import { createMemberAction } from "@/app/(dashboard)/pessoas/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ResetMemberPasswordModal } from "@/components/crm/reset-member-password-modal";
import { Switch } from "@/components/ui/switch";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { fullName } from "@/lib/utils";
import type { OrganizationMember, Role } from "@/types";
import { KeyRound, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";

export function PeopleClient({
  organizationId,
  organizationName,
  members,
  leadCounts,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  members: OrganizationMember[];
  leadCounts: Record<string, number>;
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<{ profileId: string; name: string } | null>(null);
  const [state, formAction, pending] = useActionState(createMemberAction, null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        fullName(m.profile).toLowerCase().includes(q) ||
        m.profile?.email?.toLowerCase().includes(q)
    );
  }, [members, search]);

  async function updateRole(member: OrganizationMember, role: Role) {
    await supabase.from("organization_members").update({ role }).eq("id", member.id);
    router.refresh();
  }

  async function toggleActive(member: OrganizationMember) {
    await supabase
      .from("organization_members")
      .update({ is_active: !member.is_active })
      .eq("id", member.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-3 shadow-(--shadow-card)">
        <span className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink">
          Todos usuários <span className="text-primary-600">{members.length}</span>
        </span>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input
            className="h-10 rounded-xl border-2 border-primary/70 bg-card pl-9 focus:border-primary focus:ring-0"
            placeholder="Buscar pessoa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canManage && (
          <Button className="h-10 rounded-xl" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Pessoa
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Nenhuma pessoa encontrada"
          description="Adicione membros da equipe para colaborar nas negociações."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Usuário</Th>
            <Th>E-mail</Th>
            <Th>Telefone</Th>
            <Th>Cargo</Th>
            <Th>Papel</Th>
            <Th>Leads</Th>
            <Th>Status</Th>
            {canManage && <Th><span className="sr-only">Senha</span></Th>}
          </THead>
          <TBody>
            {filtered.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={fullName(m.profile)} src={m.profile?.avatar_url} size="sm" />
                    <p className="font-semibold text-primary-700">{fullName(m.profile)}</p>
                  </div>
                </Td>
                <Td className="text-ink-soft">{m.profile?.email}</Td>
                <Td className="text-ink-soft">{m.profile?.phone ?? "—"}</Td>
                <Td className="text-ink-soft">{m.profile?.job_title ?? "—"}</Td>
                <Td>
                  {canManage ? (
                    <Select
                      className="h-8 w-36 text-xs"
                      value={m.role}
                      onChange={(e) => updateRole(m, e.target.value as Role)}
                    >
                      <option value="org_admin">Admin</option>
                      <option value="seller">Vendedor</option>
                      <option value="agent">Atendente</option>
                      <option value="viewer">Visualizador</option>
                    </Select>
                  ) : (
                    <span className="text-ink-soft">
                      {{ org_admin: "Admin", seller: "Vendedor", agent: "Atendente", viewer: "Visualizador" }[m.role]}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="font-semibold text-ink">
                    {leadCounts[m.profile_id] ?? 0}
                  </span>
                </Td>
                <Td>
                  <Switch
                    checked={m.is_active}
                    onChange={() => toggleActive(m)}
                    disabled={!canManage}
                  />
                </Td>
                {canManage && (
                  <Td>
                    <button
                      type="button"
                      onClick={() => setPasswordFor({ profileId: m.profile_id, name: fullName(m.profile) })}
                      className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-primary-50 hover:text-primary-600"
                      aria-label={`Redefinir senha de ${fullName(m.profile)}`}
                      title="Redefinir senha"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}

      <ResetMemberPasswordModal
        key={passwordFor?.profileId ?? "fechado"}
        member={passwordFor}
        onClose={() => setPasswordFor(null)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova pessoa"
        subtitle={`Adicionar usuário à ${organizationName}`}
        size="md"
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="organization_id" value={organizationId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input name="first_name" required />
            </Field>
            <Field label="Sobrenome">
              <Input name="last_name" />
            </Field>
          </div>
          <Field label="E-mail">
            <Input name="email" type="email" required />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Telefone">
              <Input name="phone" />
            </Field>
            <Field label="Cargo">
              <Input name="job_title" placeholder="Ex.: Vendedor" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Papel / permissão">
              <Select name="role" defaultValue="seller">
                <option value="org_admin">Admin da empresa</option>
                <option value="seller">Vendedor</option>
                <option value="agent">Atendente</option>
                <option value="viewer">Visualizador</option>
              </Select>
            </Field>
            <Field label="Senha inicial">
              <Input name="password" type="password" minLength={8} required />
            </Field>
          </div>

          {state?.error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{state.error}</p>
          )}
          {state?.success && (
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">
              {state.success}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Fechar
            </Button>
            <Button type="submit" loading={pending}>
              Criar pessoa
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
