import { ContactsClient } from "@/components/crm/contacts-client";
import { PageHeader } from "@/components/layout/page-header";
import {
  buildContactSearchFilter,
  CONTACTS_PER_PAGE,
  parseDealStatus,
} from "@/lib/features/contacts/domain/contact-search";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { resolvePagination } from "@/lib/utils/pagination";
import type { Contact, Deal } from "@/types";

export const metadata = { title: "Contatos" };
export const dynamic = "force-dynamic";

/**
 * Colunas explícitas em vez de `select("*")`.
 *
 * O ganho não é tamanho de payload — é contrato: `*` entrega colunas futuras
 * sem ninguém decidir isso, inclusive alguma que não deva cruzar a fronteira
 * servidor→cliente.
 *
 * `document` e `notes` ENTRAM na lista mesmo sem aparecer na tabela, e isso é
 * deliberado: `components/crm/contact-modal.tsx` semeia o formulário com o
 * contato que a lista entregou e regrava todos os campos no `submit`. Tirá-los
 * daqui faria a edição de qualquer contato **apagar em silêncio** a observação
 * e o documento — o formulário mandaria `null` porque nunca os recebeu.
 *
 * A alternativa seria o modal buscar o contato inteiro ao abrir. Vale quando a
 * lista voltar a crescer; com 25 linhas por página, carregar `notes` junto é
 * mais barato que uma consulta a cada abertura de modal.
 */
const CONTACT_COLUMNS =
  "id, organization_id, name, email, phone, whatsapp_phone, avatar_url, document, city, state, notes, created_at";

type Search = Promise<{ busca?: string; status?: string; pagina?: string }>;

export default async function ContatosPage({ searchParams }: { searchParams: Search }) {
  const { busca, status, pagina } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const filtroBusca = buildContactSearchFilter(busca);
  const filtroStatus = parseDealStatus(status);
  const { page, from, to } = resolvePagination(pagina);

  // ------------------------------------------------------------
  // Busca e paginação no SERVIDOR.
  //
  // Antes: `limit(1000)` sem paginação e busca em memória sobre o array já
  // truncado. Duas consequências, ambas silenciosas — o contato de número 1001
  // não existia para a tela, e a busca dizia "Nenhum contato encontrado" para
  // quem estava além do corte. Com a migração do Bubble (~300 empresas) isso
  // deixaria de ser hipótese em semanas.
  //
  // O filtro de status usa embed `!inner`: ele seleciona contatos que TÊM
  // negociação naquele status. É uma mudança de significado declarada — antes
  // o filtro olhava só a negociação mais recente do contato. "Tem negociação
  // ganha" é a pergunta que o operador faz, e é a única respondível sem
  // recalcular "a mais recente" para a base inteira a cada página.
  // ------------------------------------------------------------
  const selecao = filtroStatus
    ? `${CONTACT_COLUMNS}, deals!inner(id)`
    : CONTACT_COLUMNS;

  let query = supabase
    .from("contacts")
    .select(selecao, { count: "exact" })
    .eq("organization_id", orgId);

  if (filtroStatus) query = query.eq("deals.status", filtroStatus);
  if (filtroBusca) query = query.or(filtroBusca);

  const {
    data: contactsRaw,
    count,
    error: contactsError,
  } = await query.order("created_at", { ascending: false }).range(from, to);

  const contacts = (contactsRaw ?? []) as unknown as Contact[];

  // ------------------------------------------------------------
  // As negociações apenas dos contatos DESTA página.
  //
  // Antes eram 2000 deals trafegando ao navegador só para montar um `Map` de
  // "última negociação por contato". Agora são no máximo as dos 25 contatos
  // visíveis — e a consulta nem acontece quando a página está vazia.
  // ------------------------------------------------------------
  const contactIds = contacts.map((c) => c.id);
  const { data: dealsRaw, error: dealsError } =
    contactIds.length > 0
      ? await supabase
          .from("deals")
          .select("id, contact_id, status, value, created_at")
          .eq("organization_id", orgId)
          .in("contact_id", contactIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

  // Erro de leitura NÃO pode virar estado vazio: "Nenhum contato encontrado" é
  // uma afirmação, e uma consulta que falhou não a sustenta. Mesma disciplina
  // do `unknown` da saúde da entrada de leads.
  if (contactsError) {
    console.error("[contatos] falha ao listar contatos", contactsError);
  }
  if (dealsError) {
    console.error("[contatos] falha ao carregar as negociações da página", dealsError);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Vendas" title="Contatos" subtitle="Base de clientes e leads da empresa" />
      <ContactsClient
        organizationId={orgId}
        contacts={contacts}
        deals={(dealsRaw ?? []) as unknown as Deal[]}
        canEdit={session.membership.role !== "viewer"}
        total={count ?? 0}
        page={page}
        perPage={CONTACTS_PER_PAGE}
        busca={busca ?? ""}
        status={filtroStatus ?? ""}
        loadError={Boolean(contactsError)}
      />
    </div>
  );
}
