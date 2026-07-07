"use client";

import { Avatar } from "@/components/ui/avatar";
import { DealStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, normalizePhone } from "@/lib/utils";
import { contactSchema } from "@/lib/validations";
import type { Contact, Deal } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Contact as ContactIcon, ExternalLink, MoreVertical, Pencil, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type FormData = z.input<typeof contactSchema>;

export function ContactsClient({
  organizationId,
  contacts,
  deals,
}: {
  organizationId: string;
  contacts: Contact[];
  deals: Deal[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(contactSchema),
    values: editing
      ? {
          name: editing.name,
          email: editing.email ?? "",
          phone: editing.phone ?? "",
          whatsapp_phone: editing.whatsapp_phone ?? "",
          document: editing.document ?? "",
          city: editing.city ?? "",
          state: editing.state ?? "",
          notes: editing.notes ?? "",
        }
      : {
          name: "", email: "", phone: "", whatsapp_phone: "",
          document: "", city: "", state: "", notes: "",
        },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    const parsed = contactSchema.parse(data);
    const payload = {
      name: parsed.name,
      email: parsed.email || null,
      phone: parsed.phone || null,
      whatsapp_phone: parsed.whatsapp_phone ? normalizePhone(parsed.whatsapp_phone) : null,
      document: parsed.document || null,
      city: parsed.city || null,
      state: parsed.state || null,
      notes: parsed.notes || null,
    };

    if (editing) {
      const { error: err } = await supabase.from("contacts").update(payload).eq("id", editing.id);
      if (err) return setError(err.message);
    } else {
      const { error: err } = await supabase
        .from("contacts")
        .insert({ ...payload, organization_id: organizationId });
      if (err) return setError(err.message);
    }
    closeModal();
    router.refresh();
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
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
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ContactIcon className="h-6 w-6" />}
          title="Nenhum contato encontrado"
          description="Cadastre contatos ou receba leads automaticamente via formulários e WhatsApp."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Criar contato
            </Button>
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
                        <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(c)}>
                          Editar contato
                        </DropdownItem>
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

      <Modal
        open={modalOpen || !!editing}
        onClose={closeModal}
        title={editing ? "Editar contato" : "Novo contato"}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={errors.name?.message}>
              <Input placeholder="Nome completo" {...register("name")} />
            </Field>
            <Field label="E-mail" error={errors.email?.message as string}>
              <Input type="email" placeholder="email@exemplo.com" {...register("email")} />
            </Field>
            <Field label="Telefone">
              <Input placeholder="+55 11 99999-9999" {...register("phone")} />
            </Field>
            <Field label="WhatsApp">
              <Input placeholder="5511999999999" {...register("whatsapp_phone")} />
            </Field>
            <Field label="CPF/CNPJ">
              <Input {...register("document")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade">
                <Input {...register("city")} />
              </Field>
              <Field label="UF">
                <Input maxLength={2} placeholder="SP" {...register("state")} />
              </Field>
            </div>
          </div>
          <Field label="Observações">
            <Textarea {...register("notes")} />
          </Field>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Salvar" : "Criar contato"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
