"use client";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { fullName } from "@/lib/utils";
import type { Organization, OrganizationMember, Role } from "@/types";
import { BookOpen, Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

// Tela do admin global: todos os usuários de todas as organizações.
export function AdminClient({
  memberships,
  organizations,
}: {
  memberships: OrganizationMember[];
  organizations: Organization[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memberships.filter((m) => {
      if (onlyActive && !m.is_active) return false;
      if (
        q &&
        !fullName(m.profile).toLowerCase().includes(q) &&
        !m.profile?.email?.toLowerCase().includes(q) &&
        !m.organization?.name?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [memberships, search, onlyActive]);

  async function updateRole(m: OrganizationMember, role: Role) {
    await supabase.from("organization_members").update({ role }).eq("id", m.id);
    router.refresh();
  }

  async function updateOrg(m: OrganizationMember, organizationId: string) {
    await supabase
      .from("organization_members")
      .update({ organization_id: organizationId })
      .eq("id", m.id);
    router.refresh();
  }

  async function toggleActive(m: OrganizationMember) {
    await supabase
      .from("organization_members")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <span className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink">
          Todos <span className="text-primary-600">{memberships.length}</span>
        </span>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            placeholder="Buscar usuário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Switch checked={onlyActive} onChange={setOnlyActive} label="Ativos" />
        <Button variant="secondary" onClick={() => window.open("https://supabase.com/docs", "_blank")}>
          <BookOpen className="h-4 w-4" />
          Tutorial
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Nenhum usuário encontrado"
          description="Ajuste os filtros de busca."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Usuário</Th>
            <Th>Organização</Th>
            <Th>Perfil</Th>
            <Th>Telefone</Th>
            <Th>Proprietário</Th>
            <Th>Status</Th>
          </THead>
          <TBody>
            {filtered.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={fullName(m.profile)} src={m.profile?.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{fullName(m.profile)}</p>
                      <p className="truncate text-xs text-ink-faint">{m.profile?.email}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <Select
                    className="h-8 w-40 text-xs"
                    value={m.organization_id}
                    onChange={(e) => updateOrg(m, e.target.value)}
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
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
                </Td>
                <Td className="text-ink-soft">{m.profile?.phone ?? "—"}</Td>
                <Td className="text-ink-soft">{m.organization?.owner_name ?? "—"}</Td>
                <Td>
                  <Switch checked={m.is_active} onChange={() => toggleActive(m)} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}
    </div>
  );
}
