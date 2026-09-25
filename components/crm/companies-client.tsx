"use client";

import { ACTIVE_FILTER, SearchField } from "@/components/ui/search-field";


import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { createClient } from "@/lib/supabase/client";
import { cn, describeWriteError, formatDate } from "@/lib/utils";
import { organizationSchema } from "@/lib/validations";
import type { Organization } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, LogIn, MoreVertical, Pencil, Plus, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type OrgRow = Organization & { leads: number; inactivityDays: number | null };
type FormData = z.input<typeof organizationSchema>;

export function CompaniesClient({
  organizations,
  isGlobalAdmin,
  activeOrgId,
}: {
  organizations: OrgRow[];
  isGlobalAdmin: boolean;
  activeOrgId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [sort, setSort] = useState("recente");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segments = useMemo(
    () => [...new Set(organizations.map((o) => o.segment).filter(Boolean))] as string[],
    [organizations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = organizations.filter((o) => {
      if (q && !o.name.toLowerCase().includes(q) && !o.owner_name?.toLowerCase().includes(q))
        return false;
      if (segmentFilter && o.segment !== segmentFilter) return false;
      return true;
    });
    if (sort === "recente")
      list = list.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    else if (sort === "nome") list = list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "leads") list = list.sort((a, b) => b.leads - a.leads);
    return list;
  }, [organizations, search, segmentFilter, sort]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(organizationSchema),
    values: editing
      ? {
          name: editing.name,
          segment: editing.segment ?? "",
          owner_name: editing.owner_name ?? "",
          logo_url: editing.logo_url ?? "",
        }
      : { name: "", segment: "", owner_name: "", logo_url: "" },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    const parsed = organizationSchema.parse(data);
    const payload = {
      name: parsed.name,
      segment: parsed.segment || null,
      owner_name: parsed.owner_name || null,
      logo_url: parsed.logo_url || null,
    };

    if (editing) {
      const { error: err } = await supabase
        .from("organizations")
        .update(payload)
        .eq("id", editing.id);
      if (err) return setError(describeWriteError(err, "Não foi possível salvar a empresa."));
    } else {
      const { error: err } = await supabase.from("organizations").insert(payload);
      if (err)
        return setError(
          err.message.includes("policy")
            ? "Apenas o admin global pode criar novas empresas."
            : describeWriteError(err, "Não foi possível criar a empresa.")
        );
    }
    closeModal();
    router.refresh();
  }

  async function toggleActive(org: Organization) {
    await supabase
      .from("organizations")
      .update({ is_active: !org.is_active })
      .eq("id", org.id);
    router.refresh();
  }

  async function loginAsOrg(orgId: string) {
    await fetch("/api/session/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: orgId }),
    });
    router.push("/dashboard");
    router.refresh();
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue" className="px-3 py-1.5">
          Todas empresas · {organizations.length}
        </Badge>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar empresa…" label="Buscar empresa" />
        {segments.length > 0 && (
          <Select
            className={cn("h-10 rounded-xl bg-card w-auto min-w-36", segmentFilter && ACTIVE_FILTER)}
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
          >
            <option value="">Todos os segmentos</option>
            {segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Ordenação" className={cn("h-10 rounded-xl bg-card w-auto min-w-40", sort !== "recente" && ACTIVE_FILTER)} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recente">Modificada recente</option>
          <option value="nome">Nome (A-Z)</option>
          <option value="leads">Mais leads</option>
        </Select>
        {isGlobalAdmin && (
          <Button className="h-10 rounded-xl" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Empresa
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="Nenhuma empresa encontrada"
          description="Ajuste a busca ou crie uma nova empresa."
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Empresa</Th>
            <Th>Segmento</Th>
            <Th>Leads</Th>
            <Th>Proprietário</Th>
            <Th>Inatividade</Th>
            <Th>Modificação</Th>
            <Th className="text-right">Ações</Th>
          </THead>
          <TBody>
            {filtered.map((org) => (
              <Tr key={org.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={org.name} src={org.logo_url} size="sm" />
                    <div>
                      <p className="font-semibold text-ink">{org.name}</p>
                      {!org.is_active && <Badge tone="red">Inativa</Badge>}
                      {org.id === activeOrgId && <Badge tone="blue">Atual</Badge>}
                    </div>
                  </div>
                </Td>
                <Td className="text-ink-soft">{org.segment ?? "—"}</Td>
                <Td>
                  <span className="font-semibold text-ink">{org.leads}</span>
                </Td>
                <Td className="text-ink-soft">{org.owner_name ?? "—"}</Td>
                <Td>
                  {org.inactivityDays === null ? (
                    <span className="text-ink-faint">N/A</span>
                  ) : (
                    <Badge tone={org.inactivityDays > 7 ? "amber" : "green"}>
                      {org.inactivityDays} dias
                    </Badge>
                  )}
                </Td>
                <Td className="text-ink-soft">{formatDate(org.updated_at)}</Td>
                <Td>
                  <div className="flex justify-end">
                    <Dropdown
                      trigger={
                        <button className="rounded-lg p-2 text-ink-faint hover:bg-muted hover:text-ink">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      }
                    >
                      <DropdownItem
                        icon={<UserCircle className="h-4 w-4" />}
                        onClick={() => router.push(`/empresas/${org.id}`)}
                      >
                        Acessar perfil
                      </DropdownItem>
                      <DropdownItem
                        icon={<LogIn className="h-4 w-4" />}
                        onClick={() => loginAsOrg(org.id)}
                      >
                        Logar nesta empresa
                      </DropdownItem>
                      <DropdownItem
                        icon={<Pencil className="h-4 w-4" />}
                        onClick={() => setEditing(org)}
                      >
                        Editar
                      </DropdownItem>
                      {isGlobalAdmin && (
                        <DropdownItem danger onClick={() => toggleActive(org)}>
                          {org.is_active ? "Desativar" : "Reativar"}
                        </DropdownItem>
                      )}
                    </Dropdown>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}

      <Modal
        open={modalOpen || !!editing}
        onClose={closeModal}
        title={editing ? "Editar empresa" : "Nova empresa"}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Nome" error={errors.name?.message}>
            <Input placeholder="Nome da empresa" {...register("name")} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Segmento">
              <Input placeholder="Ex.: Plano de Saúde" {...register("segment")} />
            </Field>
            <Field label="Proprietário">
              <Input placeholder="Nome do responsável" {...register("owner_name")} />
            </Field>
          </div>
          <Field label="URL do logo" error={errors.logo_url?.message as string}>
            <Input placeholder="https://…" {...register("logo_url")} />
          </Field>
          {editing && (
            <div className="flex items-center justify-between rounded-xl border border-line bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium text-ink-soft">Empresa ativa</span>
              <Switch checked={editing.is_active} onChange={() => toggleActive(editing)} />
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Salvar" : "Criar empresa"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
