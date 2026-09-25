import { LeadPortfolioTable, type LinhaCarteira } from "@/components/crm/lead-portfolio-table";
import { PageHeader } from "@/components/layout/page-header";
import { ReportNav } from "@/components/crm/report-nav";
import { StatCard } from "@/components/ui/card";
import {
  ATRASO_ATENCAO_DIAS,
  ATRASO_CRITICO_DIAS,
  diasParado,
  janelaEmDias,
  parseJanela,
  parseOrdem,
  situacao,
} from "@/lib/features/lead-followup/domain/follow-up";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PER_PAGE, resolvePagination } from "@/lib/utils/pagination";
import { AlertTriangle, Clock, MessageCircleWarning, NotebookPen } from "lucide-react";

export const metadata = { title: "Carteira de leads" };
export const dynamic = "force-dynamic";

type Search = Promise<{
  ordem?: string;
  janela?: string;
  busca?: string;
  pagina?: string;
}>;

export default async function CarteiraPage({ searchParams }: { searchParams: Search }) {
  const { ordem: ordemRaw, janela: janelaRaw, busca, pagina } = await searchParams;
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const ordem = parseOrdem(ordemRaw);
  const janela = parseJanela(janelaRaw);
  const { page, from } = resolvePagination(pagina, DEFAULT_PER_PAGE);

  // `seller`/`agent` veem a MESMA tela recortada nos próprios leads — a RPC faz
  // o recorte reimplementando a `0011`, então os números deles são corretos,
  // não parciais. A coluna Responsável some porque seria o mesmo nome 25 vezes.
  //
  // Isso é diferente de `/relatorios/vendedores`, que bloqueia o vendedor: lá o
  // número ESTARIA errado (somaria a equipe sobre visão parcial). Aqui ele está
  // certo e é a fila de trabalho da pessoa.
  const visaoDaEmpresa =
    session.membership.role === "org_admin" ||
    session.membership.role === "viewer" ||
    session.profile.is_global_admin;

  const { data, error } = await supabase.rpc("carteira_sem_tratativa", {
    org_id: orgId,
    ordem,
    dias_minimos: janelaEmDias(janela),
    apenas_nunca: janela === "nunca",
    busca: busca ?? null,
    pagina: Math.floor(from / DEFAULT_PER_PAGE),
    tamanho: DEFAULT_PER_PAGE,
  });

  if (error) {
    console.error("[carteira] falha ao carregar a carteira", error);
  }

  const linhas = (data ?? []) as unknown as (LinhaCarteira & { total: number })[];
  const total = linhas[0]?.total ? Number(linhas[0].total) : 0;

  // ------------------------------------------------------------
  // Os KPIs medem a CARTEIRA INTEIRA, não a página.
  //
  // Por isso uma segunda chamada, sem filtro de janela e com o teto da RPC:
  // "3 parados há 7+ dias" precisa continuar verdadeiro na página 3, senão o
  // número muda conforme se navega e ninguém confia nele.
  // ------------------------------------------------------------
  const { data: universoRaw } = await supabase.rpc("carteira_sem_tratativa", {
    org_id: orgId,
    ordem: "parados",
    dias_minimos: null,
    apenas_nunca: false,
    busca: null,
    pagina: 0,
    tamanho: 100,
  });
  const universo = (universoRaw ?? []) as unknown as LinhaCarteira[];
  const agora = new Date();

  const avaliados = universo.map((l) => {
    const followUp = {
      equipeTratouEm: l.equipe_tratou_em,
      leadFalouEm: l.lead_falou_em,
      criadoEm: l.criado_em,
    };
    return { dias: diasParado(followUp, agora), sit: situacao(followUp, agora), linha: l };
  });

  const abertas = avaliados.length;
  const aguardando = avaliados.filter((a) => a.sit === "aguardando_resposta").length;
  const criticos = avaliados.filter((a) => a.dias >= ATRASO_CRITICO_DIAS).length;
  const comRegistro = avaliados.filter((a) => a.linha.notas > 0 || a.linha.tarefas > 0).length;
  const cobertura = abertas > 0 ? Math.round((comRegistro / abertas) * 100) : 0;

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Análise"
        title="Carteira de leads"
        subtitle={
          visaoDaEmpresa
            ? "Quem está esperando tratativa da equipe"
            : "Seus leads abertos, do mais parado ao mais recente"
        }
      />
      <ReportNav />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aguardando resposta"
          sublabel="o lead falou depois da última tratativa"
          value={aguardando}
          tone={aguardando > 0 ? "red" : "green"}
          icon={<MessageCircleWarning className="h-5 w-5 text-destructive-text" />}
        />
        <StatCard
          label={`Parados há ${ATRASO_CRITICO_DIAS}+ dias`}
          sublabel="dias corridos, sem tratativa da equipe"
          value={criticos}
          tone={criticos > 0 ? "amber" : "green"}
          icon={<Clock className="h-5 w-5 text-warning-text" />}
        />
        <StatCard
          label="Negociações abertas"
          sublabel="o universo desta carteira"
          value={abertas}
          tone="blue"
        />
        <StatCard
          label="Com registro no CRM"
          sublabel="nota ou tarefa associada"
          value={`${comRegistro} de ${abertas}`}
          hint={`${cobertura}% da carteira`}
          tone="slate"
          icon={<NotebookPen className="h-5 w-5 text-ink-faint" />}
        />
      </div>

      {/* A frase de honestidade aparece UMA vez, não por linha. Ela desarma a
          leitura errada antes que ela vire decisão sobre pessoas — a diferença
          entre um relatório e uma acusação. */}
      {abertas > 0 && cobertura < 10 && (
        <p
          role="status"
          className="mt-4 flex items-start gap-3 rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning-text"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Quase nenhuma negociação tem nota ou tarefa registrada. Esta tela mede o que
            foi <b>registrado no CRM</b>, não o esforço da equipe — respostas enviadas
            pelo WhatsApp contam como tratativa, mas ligações e conversas fora daqui não.
          </span>
        </p>
      )}

      <div className="mt-4">
        <LeadPortfolioTable
          linhas={linhas}
          total={total}
          page={page}
          perPage={DEFAULT_PER_PAGE}
          ordem={ordem}
          janela={janela}
          busca={busca ?? ""}
          mostraResponsavel={visaoDaEmpresa}
          loadError={Boolean(error)}
        />
      </div>
    </div>
  );
}
