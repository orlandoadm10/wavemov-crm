"use client";

import { ContactModal } from "@/components/crm/contact-modal";
import { Avatar } from "@/components/ui/avatar";
import { DealStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Contact, Deal } from "@/types";
import {
  Contact as ContactIcon,
  ExternalLink,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Espera antes de levar o que foi digitado para a URL.
 *
 * Cada mudança de URL é uma ida ao servidor. Sem a espera, "Maria" seriam cinco
 * consultas e a última poderia chegar antes da penúltima.
 */
const BUSCA_DEBOUNCE_MS = 400;

export function ContactsClient({
  organizationId,
  contacts,
  deals,
  canEdit,
  total,
  page,
  perPage,
  busca,
  status,
  loadError,
}: {
  organizationId: string;
  /** Só os contatos DESTA página — a filtragem acontece no servidor. */
  contacts: Contact[];
  /** Só as negociações dos contatos desta página. */
  deals: Deal[];
  /** `viewer` é somente leitura: sem gatilho de escrita, e não só sem permissão. */
  canEdit: boolean;
  /** Total de contatos que casam com os filtros, não o tamanho da página. */
  total: number;
  page: number;
  perPage: number;
  busca: string;
  status: string;
  /** A consulta falhou. Estado vazio mentiria; ver `EmptyState` abaixo. */
  loadError: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // O input é controlado localmente para não perder caractere enquanto a
  // navegação acontece; a URL é a fonte da verdade e o efeito abaixo
  // ressincroniza quando ela muda por outro caminho (voltar, link colado).
  const [termo, setTermo] = useState(busca);
  useEffect(() => setTermo(busca), [busca]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  // O cálculo de intervalo e o desenho da barra vivem em
  // `components/ui/pagination.tsx` desde que a carteira de leads virou o
  // segundo consumidor.
  const temFiltro = Boolean(busca || status);

  function setParams(mudancas: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) next.set(chave, valor);
      else next.delete(chave);
    }
    // Toda mudança de filtro volta para a primeira página: manter a página 7
    // ao trocar a busca costuma cair num intervalo vazio, e a tela diz "nenhum
    // contato" quando na verdade há resultados na página 1.
    if (!("pagina" in mudancas)) next.delete("pagina");
    router.replace(`${pathname}?${next.toString()}`);
  }

  // Debounce do que é digitado. O `ref` guarda o timer entre renders; sem ele,
  // cada tecla criaria um agendamento novo sem cancelar o anterior.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onBuscaChange(valor: string) {
    setTermo(valor);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ busca: valor }), BUSCA_DEBOUNCE_MS);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Última negociação de cada contato desta página. As linhas chegam ordenadas
  // por `created_at desc`, então a primeira que aparece é a mais recente.
  const dealByContact = useMemo(() => {
    const map = new Map<string, Deal>();
    for (const d of deals) {
      if (d.contact_id && !map.has(d.contact_id)) map.set(d.contact_id, d);
    }
    return map;
  }, [deals]);

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
            aria-label="Buscar contato por nome, e-mail ou telefone"
            value={termo}
            onChange={(e) => onBuscaChange(e.target.value)}
          />
        </div>
        <Select
          className="w-auto min-w-44"
          aria-label="Filtrar por status da negociação"
          value={status}
          onChange={(e) => setParams({ status: e.target.value })}
        >
          <option value="">Todos os status</option>
          <option value="open">Com negociação em andamento</option>
          <option value="won">Com negociação ganha</option>
          <option value="lost">Com negociação perdida</option>
        </Select>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        )}
      </div>

      {loadError ? (
        // Falha de leitura tem estado próprio. Cair no vazio afirmaria que a
        // empresa não tem contatos — e o dado não sustenta essa afirmação.
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-line bg-rose-50 p-4 text-sm text-rose-800"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Não foi possível carregar os contatos agora. Atualize a página; se continuar,
            avise um administrador.
          </span>
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<ContactIcon className="h-6 w-6" />}
          title={temFiltro ? "Nenhum contato para este filtro" : "Nenhum contato ainda"}
          description={
            temFiltro
              ? "Nenhum contato da empresa casa com a busca ou o status escolhido."
              : "Cadastre contatos ou receba leads automaticamente via formulários e WhatsApp."
          }
          action={
            temFiltro ? (
              <Button variant="outline" onClick={() => setParams({ busca: "", status: "" })}>
                Limpar filtros
              </Button>
            ) : canEdit ? (
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Criar contato
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
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
              {contacts.map((c) => {
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
                    <Td>
                      {deal ? (
                        <DealStatusBadge status={deal.status} />
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </Td>
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
                            <DropdownItem
                              icon={<Pencil className="h-4 w-4" />}
                              onClick={() => setEditing(c)}
                            >
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

          <Pagination
            total={total}
            page={page}
            perPage={perPage}
            singular="contato"
            plural="contatos"
            ariaLabel="Paginação dos contatos"
            onPageChange={(p) => setParams({ pagina: String(p) })}
          />
        </>
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
