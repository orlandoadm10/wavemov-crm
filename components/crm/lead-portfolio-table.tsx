"use client";

// ============================================================
// Carteira de leads — tabela e filtros.
//
// Uma tabela, duas perguntas: `ordem=parados` responde "quem está esperando
// por nós"; `ordem=recentes` responde "quem chegou agora". Foi assim que a
// lista de últimos leads paginada e a visão estratégica couberam na mesma
// tela — o produto já tinha duas listas de lead e uma terceira seria a
// garantia de que os filtros divergiriam.
//
// A tabela ordena LEADS, não pessoas. Nada aqui colore o nome do responsável
// por atraso nem soma "atrasos por vendedor": esse número é de
// `/relatorios/vendedores`, com o contexto dele. Um administrador que abre a
// carteira para escolher quem repreender para de usá-la assim que a equipe
// descobre; um que abre para escolher quem ajudar volta amanhã.
// ============================================================
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import {
  diasParado,
  formatarAtraso,
  JANELA_LABEL,
  JANELAS,
  rotularTratativa,
  situacao,
  SITUACAO_LABEL,
  SITUACAO_TOM,
  tomDoAtraso,
  type Janela,
  type Ordem,
} from "@/lib/features/lead-followup/domain/follow-up";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CheckCircle2, Layers, Search, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Mesma espera de `/contatos`: cada mudança de URL é uma ida ao servidor. */
const BUSCA_DEBOUNCE_MS = 400;

export interface LinhaCarteira {
  deal_id: string;
  titulo: string;
  valor: number | null;
  origem: string | null;
  criado_em: string;
  contato_id: string | null;
  contato_nome: string | null;
  etapa_nome: string | null;
  funil_nome: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  equipe_tratou_em: string | null;
  ultima_tratativa_tipo: string | null;
  lead_falou_em: string | null;
  notas: number;
  tarefas: number;
  negociacoes_do_contato: number;
}

export function LeadPortfolioTable({
  linhas,
  total,
  page,
  perPage,
  ordem,
  janela,
  busca,
  mostraResponsavel,
  loadError,
}: {
  linhas: LinhaCarteira[];
  total: number;
  page: number;
  perPage: number;
  ordem: Ordem;
  janela: Janela;
  busca: string;
  /** `false` para vendedor: seria o mesmo nome em 25 linhas. */
  mostraResponsavel: boolean;
  loadError: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [termo, setTermo] = useState(busca);
  useEffect(() => setTermo(busca), [busca]);

  function setParams(mudancas: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) next.set(chave, valor);
      else next.delete(chave);
    }
    // Trocar filtro ou ordenação volta à página 1: manter a página 3 depois de
    // apertar o critério cai num intervalo vazio, e a tela diria "nenhum lead"
    // havendo resultado na primeira.
    if (!("pagina" in mudancas)) next.delete("pagina");
    router.replace(`${pathname}?${next.toString()}`);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onBusca(valor: string) {
    setTermo(valor);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ busca: valor }), BUSCA_DEBOUNCE_MS);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const agora = new Date();
  const temFiltro = Boolean(busca) || janela !== "todos";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            placeholder="Buscar por lead ou contato…"
            aria-label="Buscar por lead ou contato"
            value={termo}
            onChange={(e) => onBusca(e.target.value)}
          />
        </div>
        <Select
          className="w-auto min-w-48"
          aria-label="Filtrar por tempo sem tratativa"
          value={janela}
          onChange={(e) => setParams({ janela: e.target.value })}
        >
          {JANELAS.map((j) => (
            <option key={j} value={j}>
              {JANELA_LABEL[j]}
            </option>
          ))}
        </Select>
        {/* O `Select` de ordenação é a ÚNICA forma de ordenar abaixo de `md`:
            ali a tabela vira cartões e não existe cabeçalho para clicar. Sem
            ele, ordenar deixaria de existir no celular. */}
        <Select
          className="w-auto min-w-44"
          aria-label="Ordenar a carteira"
          value={ordem}
          onChange={(e) => setParams({ ordem: e.target.value })}
        >
          <option value="parados">Mais tempo sem tratativa</option>
          <option value="recentes">Recebidos mais recentemente</option>
        </Select>
      </div>

      {loadError ? (
        // Falha de leitura tem estado próprio. "Nenhum lead parado" é uma
        // afirmação, e uma consulta que falhou não a sustenta.
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-line bg-rose-50 p-4 text-sm text-rose-800"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Não foi possível carregar a carteira agora. Atualize a página; se continuar,
            avise um administrador.
          </span>
        </div>
      ) : linhas.length === 0 ? (
        temFiltro ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="Nenhum lead neste recorte"
            description="Nenhuma negociação aberta se encaixa no filtro escolhido."
            action={
              <Button variant="outline" onClick={() => setParams({ janela: "todos", busca: "" })}>
                Ver a carteira inteira
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Layers className="h-6 w-6" />}
            title="Nenhuma negociação aberta"
            description="Quando entrar um lead, ele aparece aqui com o tempo desde a última tratativa."
            action={
              <Link href="/negociacoes">
                <Button variant="outline">Ir para negociações</Button>
              </Link>
            }
          />
        )
      ) : (
        <>
          {/* ------------------------------------------------------------
              Duas apresentações do MESMO array.

              Abaixo de `md` a tabela vira cartões. O `DataTable` tem
              `min-w-[640px]` e rola na horizontal — aceitável numa tabela de
              consulta, inadequado aqui: a primeira coluna é a que ORDENA, e o
              scroll a esconde exatamente quando o dedo empurra para ver o
              resto. O ranking sumiria justamente no aparelho em que o
              administrador abre relatório.

              A marcação duplica; o cálculo, não — `avaliar()` é uma função só.
              ------------------------------------------------------------ */}
          <ul className="space-y-2 md:hidden">
            {linhas.map((l) => {
              const { dias, sit, tom } = avaliar(l, agora);
              return (
                <li key={l.deal_id}>
                  <Link
                    href={`/negociacoes/${l.deal_id}`}
                    className="block rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card) transition-colors hover:border-primary-200"
                  >
                    <div className="flex items-start gap-3">
                      {tom === "slate" ? (
                        <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                          {formatarAtraso(dias)}
                        </span>
                      ) : (
                        <Badge tone={tom}>
                          <span className="tabular-nums">{formatarAtraso(dias)}</span>
                        </Badge>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          {l.contato_nome ?? l.titulo}
                        </p>
                        <p className="truncate text-xs text-ink-faint">
                          {[l.valor ? formatCurrency(l.valor) : null, l.origem]
                            .filter(Boolean)
                            .join(" · ") || l.titulo}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone={SITUACAO_TOM[sit]} dot>
                        {SITUACAO_LABEL[sit]}
                      </Badge>
                      {l.etapa_nome && (
                        <span className="text-xs text-ink-soft">{l.etapa_nome}</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-ink-faint">
                      {mostraResponsavel
                        ? `${l.responsavel_nome ?? "Sem responsável"} · `
                        : ""}
                      {rotularTratativa(l.ultima_tratativa_tipo)}
                    </p>
                    {(l.notas > 0 || l.tarefas > 0 || l.negociacoes_do_contato > 1) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {l.notas > 0 && (
                          <Badge tone="slate">
                            {l.notas} {l.notas === 1 ? "nota" : "notas"}
                          </Badge>
                        )}
                        {l.tarefas > 0 && (
                          <Badge tone="slate">
                            {l.tarefas} {l.tarefas === 1 ? "tarefa" : "tarefas"}
                          </Badge>
                        )}
                        {l.negociacoes_do_contato > 1 && (
                          <Badge tone="slate">
                            {l.negociacoes_do_contato} negociações
                          </Badge>
                        )}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden md:block">
          <DataTable>
            <THead>
              {/* "Parado há" é a primeira coluna porque é a que ordena: o olho
                  precisa conferir o ranking sem atravessar a tabela. */}
              <Th>Parado há</Th>
              <Th>Lead</Th>
              <Th>Situação</Th>
              <Th>Etapa</Th>
              {mostraResponsavel && <Th>Responsável</Th>}
              <Th>Última tratativa</Th>
              <Th>Reg.</Th>
            </THead>
            <TBody>
              {linhas.map((l) => {
                const { dias, sit, tom } = avaliar(l, agora);
                return (
                  <Tr key={l.deal_id}>
                    <Td>
                      {tom === "slate" ? (
                        <span className="text-sm tabular-nums text-ink-soft">
                          {formatarAtraso(dias)}
                        </span>
                      ) : (
                        <Badge tone={tom}>
                          <span className="tabular-nums">{formatarAtraso(dias)}</span>
                        </Badge>
                      )}
                      <p className="mt-0.5 text-xs text-ink-faint">
                        desde {formatDate(l.equipe_tratou_em ?? l.criado_em)}
                      </p>
                    </Td>
                    <Td>
                      <Link
                        href={`/negociacoes/${l.deal_id}`}
                        className="font-semibold text-ink hover:text-primary-700"
                      >
                        {l.contato_nome ?? l.titulo}
                      </Link>
                      <p className="text-xs text-ink-faint">
                        {[l.valor ? formatCurrency(l.valor) : null, l.origem]
                          .filter(Boolean)
                          .join(" · ") || l.titulo}
                      </p>
                      {/* Sinaliza a repetição em vez de escondê-la: a lista NÃO
                          agrupa. Duas entradas do mesmo contato são dois
                          recebimentos reais. */}
                      {l.negociacoes_do_contato > 1 && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
                          <Users className="h-3 w-3" aria-hidden="true" />
                          {l.negociacoes_do_contato} negociações deste contato
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={SITUACAO_TOM[sit]} dot>
                        {SITUACAO_LABEL[sit]}
                      </Badge>
                    </Td>
                    <Td className="text-ink-soft">
                      {l.etapa_nome ?? "—"}
                      {l.funil_nome && (
                        <p className="text-xs text-ink-faint">{l.funil_nome}</p>
                      )}
                    </Td>
                    {mostraResponsavel && (
                      <Td>
                        {l.responsavel_id ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={l.responsavel_nome ?? "?"} size="sm" />
                            <span className="truncate text-sm text-ink-soft">
                              {l.responsavel_nome ?? "—"}
                            </span>
                          </div>
                        ) : (
                          <Link href="/distribuicao">
                            <Badge tone="red">Sem responsável</Badge>
                          </Link>
                        )}
                      </Td>
                    )}
                    <Td className="text-ink-soft">
                      {/* O tipo aparece porque `stage_changed` conta como
                          tratativa: arrastar cards numa arrumação de segunda
                          "trata" leads sem ninguém falar com ninguém. Mostrar o
                          tipo deixa o admin julgar em vez de acreditar. */}
                      {rotularTratativa(l.ultima_tratativa_tipo)}
                    </Td>
                    <Td>
                      {/* Ausência vira travessão, nunca "0 notas · 0 tarefas".
                          Zero é um número medido: convida à comparação e não
                          entrega nenhuma. Repetido em 25 linhas, ensina a
                          ignorar a tabela. */}
                      {l.notas === 0 && l.tarefas === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {l.notas > 0 && (
                            <Badge tone="slate">
                              {l.notas} {l.notas === 1 ? "nota" : "notas"}
                            </Badge>
                          )}
                          {l.tarefas > 0 && (
                            <Badge tone="slate">
                              {l.tarefas} {l.tarefas === 1 ? "tarefa" : "tarefas"}
                            </Badge>
                          )}
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          </div>

          <Pagination
            total={total}
            page={page}
            perPage={perPage}
            singular="lead"
            plural="leads"
            ariaLabel="Paginação da carteira"
            onPageChange={(p) => setParams({ pagina: String(p) })}
          />
        </>
      )}
    </div>
  );
}

/**
 * O cálculo de uma linha, usado pela tabela e pelos cartões.
 *
 * Duplicar a marcação de duas apresentações é aceitável; duplicar o cálculo
 * não — as duas divergiriam na primeira mudança de limiar, e a tabela e o
 * cartão diriam coisas diferentes sobre o mesmo lead.
 */
function avaliar(l: LinhaCarteira, agora: Date) {
  const followUp = {
    equipeTratouEm: l.equipe_tratou_em,
    leadFalouEm: l.lead_falou_em,
    criadoEm: l.criado_em,
  };
  const dias = diasParado(followUp, agora);
  return { dias, sit: situacao(followUp, agora), tom: tomDoAtraso(dias) };
}
