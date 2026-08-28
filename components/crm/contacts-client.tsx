"use client";


import { ContactModal } from "@/components/crm/contact-modal";
import { Avatar } from "@/components/ui/avatar";
import { DealStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Contact, Deal } from "@/types";
import { Contact as ContactIcon, ExternalLink, MoreVertical, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function ContactsClient({
  organizationId,
  contacts,
  deals,
  canEdit,
}: {
  organizationId: string;
  contacts: Contact[];
  deals: Deal[];
  /** `viewer` é somente leitura: sem gatilho de escrita, e não só sem permissão. */
  canEdit: boolean;
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  // Última negociação de cada contato (para status/funil/etapa/valor)
  const dealByContact = useMemo(() => {
    const map = new Map<string, Deal>();
    for (const d of deals) {
      if (d.contact_id && !map.has(d.contact_id)) map.set(d.contact_id, d);
    }
    return map;
  }, [deals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.email?.toLowerCase().includes(q) &&
        !c.phone?.includes(q) &&
        !c.whatsapp_phone?.includes(q)
      )
        return false;
      if (statusFilter) {
        const deal = dealByContact.get(c.id);
        if (!deal || deal.status !== statusFilter) return false;
      }
      return true;
    });
  }, [contacts, search, statusFilter, dealByContact]);

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            placeholder="Buscar contato por nome, e-mail ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-auto min-w-36"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="open">Em andamento</option>
          <option value="won">Ganhos</option>
          <option value="lost">Perdidos</option>
        </Select>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ContactIcon className="h-6 w-6" />}
          title="Nenhum contato encontrado"
          description="Cadastre contatos ou receba leads automaticamente via formulários e WhatsApp."
          action={
            canEdit ? (
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Criar contato
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable>
          <THead>
            <Th>Cliente</Th>
            <Th>Status</Th>
            <Th>Data</Th>
            <Th>Valor</Th>
            <Th>Telefone</Th>
            <Th>Cidade</Th>
            <Th className="text-right">Ações</Th>
          </THead>
          <TBody>
            {filtered.map((c) => {
              const deal = dealByContact.get(c.id);
              return (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} src={c.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{c.name}</p>
                        {c.email && (
                          <p className="truncate text-xs text-ink-faint">{c.email}</p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>{deal ? <DealStatusBadge status={deal.status} /> : <span className="text-ink-faint">—</span>}</Td>
                  <Td className="text-ink-soft">{formatDate(c.created_at)}</Td>
                  <Td className="font-medium text-ink">
                    {deal ? formatCurrency(deal.value) : "—"}
                  </Td>
                  <Td className="text-ink-soft">
                    {c.whatsapp_phone ? `+${c.whatsapp_phone}` : c.phone ?? "—"}
                  </Td>
                  <Td className="text-ink-soft">
                    {[c.city, c.state].filter(Boolean).join(" / ") || "—"}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <Dropdown
                        trigger={
                          <button className="rounded-lg p-2 text-ink-faint hover:bg-slate-100 hover:text-ink">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        }
                      >
                        {canEdit && (
                          <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(c)}>
                            Editar contato
                          </DropdownItem>
                        )}
                        {deal && (
                          <DropdownItem
                            icon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => router.push(`/negociacoes/${deal.id}`)}
                          >
                            Abrir negociação
                          </DropdownItem>
                        )}
                      </Dropdown>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </DataTable>
      )}

      <ContactModal
        open={modalOpen || !!editing}
        onClose={closeModal}
        organizationId={organizationId}
        contact={editing}
      />
    </div>
  );
}
