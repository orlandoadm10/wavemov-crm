/**
 * Leitura do `metadata` da submissão — sem Supabase, sem React.
 *
 * A origem manda o que quiser: o Typeform empacota todas as respostas numa
 * ÚNICA string com quebras de linha (`"POSSUI CNPJ?: MEI\nQUANTAS VIDAS?: 4"`)
 * e o Meta Lead Ads faz o mesmo em outra chave. Ao lado disso vêm dados
 * técnicos soltos (`typeform_response_id`, `ID_form`, `genero_confianca`).
 *
 * Guardamos tudo como veio (migration 0015) e interpretamos aqui, num lugar
 * só: a mesma leitura serve ao detalhe do lead e ao atendimento, e um dia a
 * uma terceira tela. Nada aqui altera o dado gravado.
 */

/** Uma pergunta do formulário de origem e o que o lead respondeu. */
export interface LeadAnswer {
  question: string;
  answer: string;
}

export interface LeadInfo {
  /** As respostas do formulário — o que o atendente precisa ler. */
  answers: LeadAnswer[];
  /** O resto do `metadata`: enriquecimento, UTM. Sem os ids da origem. */
  extras: LeadAnswer[];
  /**
   * Chave do `metadata` que continha o bloco de respostas (`r_lista`,
   * `r-lista`…), ou `null` quando não havia bloco.
   *
   * A tela NUNCA mostra este nome — é detalhe da origem, não informação do
   * lead. Ele existe porque a edição precisa gravar de volta na MESMA chave,
   * sem inventar uma segunda nem apagar o resto do `metadata`.
   */
  answersKey: string | null;
}

/**
 * Chave usada quando o usuário escreve informações num lead cuja origem não
 * mandou bloco nenhum.
 */
export const DEFAULT_ANSWERS_KEY = "respostas";

/**
 * Identificadores da origem, escondidos da tela.
 *
 * O id da resposta (`typeform_response_id`) não diz nada a quem atende: é um
 * token opaco de outro sistema. O que serve de referência visual é o id do
 * FORMULÁRIO, que a tela mostra a partir de `forms.external_id` — o valor que
 * o operador colou e reconhece. Os ids de formulário que vêm no payload
 * (`ID_form`) também saem daqui para não duplicar essa linha.
 */
const ORIGIN_ID_KEYS = [/response_?id$/i, /^id_?form$/i, /^form_?id$/i, /^lead_?id$/i];

function isOriginIdKey(key: string): boolean {
  return ORIGIN_ID_KEYS.some((pattern) => pattern.test(key));
}

/**
 * Uma linha do bloco vira pergunta + resposta pelo PRIMEIRO `:`.
 *
 * Primeiro, e não último: as perguntas terminam em `?` ou `:` e as respostas
 * é que costumam conter dois-pontos ("Custo: Até R$ 4.000"). Quebrar pelo
 * último jogaria metade da pergunta dentro da resposta.
 *
 * Linha sem separador não é descartada — vira resposta sem pergunta, porque
 * jogar fora conteúdo que o lead escreveu é pior que exibi-lo sem rótulo.
 */
function parseAnswerLine(line: string): LeadAnswer | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const separator = trimmed.indexOf(":");
  if (separator === -1) return { question: "", answer: trimmed };

  const question = trimmed.slice(0, separator).trim();
  const answer = trimmed.slice(separator + 1).trim();
  if (!answer) return null;
  return { question, answer };
}

/**
 * Desfaz quebras de linha ESCAPADAS.
 *
 * O n8n entrega o bloco do Typeform com `\n` literal — barra invertida seguida
 * de `n`, dois caracteres — e não com quebra de linha de verdade. Conferido no
 * dado gravado em produção: `r_lista` chegou com 464 caracteres numa única
 * linha. Sem esta normalização o bloco nunca tem mais de uma linha, nunca é
 * reconhecido como respostas e acaba desenhado como `R lista: <texto gigante>`
 * — que foi exatamente o defeito relatado.
 *
 * Trata também `\r\n`, porque origem que escapa `\n` costuma escapar o par.
 */
function unescapeNewlines(value: string): string {
  return value.replace(/\\r\\n|\\n|\\r/g, "\n");
}

/**
 * Todo valor com mais de uma linha é bloco de respostas. Sem exceção.
 *
 * A regra é essa, e não "a maioria das linhas tem `:`", por uma razão de
 * produto: o nome da chave da origem (`r_lista`, `r-lista`) NUNCA pode
 * aparecer na tela. Enquanto a classificação dependia do conteúdo, bastava um
 * dado fora do previsto — uma resposta que o lead escreveu em duas linhas, uma
 * pergunta sem dois-pontos — para o bloco inteiro cair nos extras e ser
 * desenhado como `R lista: <texto gigante>`.
 *
 * Rotular um texto de várias linhas com o nome técnico da chave nunca é o que
 * se quer; tratá-lo como respostas, mesmo mal formatado, sempre é. As linhas
 * sem separador viram resposta sem pergunta, e o conteúdo aparece do mesmo
 * jeito.
 */
function isAnswerBlock(lines: string[]): boolean {
  return lines.length > 1;
}

/**
 * Transforma o nome técnico da chave em rótulo legível:
 * `typeform_response_id` → `Typeform response id`.
 */
function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Separa o `metadata` em respostas e dados técnicos.
 *
 * O critério é a FORMA do valor, não o nome da chave: qualquer valor com mais
 * de uma linha no formato `pergunta: resposta` é tratado como bloco de
 * respostas. Assim `r_lista` (Typeform) e `r-lista` (Meta) funcionam sem que
 * o código conheça nenhuma das duas — e uma origem futura com outro nome
 * também funciona, sem alteração aqui.
 *
 * Valores vazios ou só com espaços são descartados: o `utm` chega como `""`
 * ou `"  "` nos dois payloads reais e viraria uma linha inútil na tela.
 */
export function parseLeadInfo(metadata: unknown): LeadInfo {
  const answers: LeadAnswer[] = [];
  const extras: LeadAnswer[] = [];
  let answersKey: string | null = null;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { answers, extras, answersKey };
  }

  for (const [key, rawValue] of Object.entries(metadata as Record<string, unknown>)) {
    if (rawValue === null || rawValue === undefined) continue;
    // Ids da origem não são informação do lead: a referência visual é o id do
    // formulário, que a tela lê de `forms.external_id`.
    if (isOriginIdKey(key)) continue;
    // Normaliza ANTES de qualquer decisão: é a diferença entre um bloco de
    // respostas e uma única linha de 464 caracteres.
    const value = unescapeNewlines(String(rawValue)).trim();
    if (!value) continue;

    const lines = value.split("\n").filter((l) => l.trim());

    if (isAnswerBlock(lines)) {
      answersKey ??= key;
      for (const line of lines) {
        const parsed = parseAnswerLine(line);
        if (parsed) answers.push(parsed);
      }
    } else {
      extras.push({ question: humanizeKey(key), answer: value });
    }
  }

  return { answers, extras, answersKey };
}

/** Há algo que valha desenhar? Evita renderizar um card vazio. */
export function hasLeadInfo(info: LeadInfo): boolean {
  return info.answers.length > 0 || info.extras.length > 0;
}

/**
 * As respostas de volta ao formato de texto que a origem manda e que o usuário
 * edita: uma linha por `pergunta: resposta`.
 *
 * É o inverso de `parseLeadInfo` para o bloco de respostas — o que a caixa de
 * edição mostra e o que é gravado de volta em `metadata[answersKey]`.
 */
export function serializeLeadAnswers(answers: LeadAnswer[]): string {
  return answers
    .map((a) => (a.question ? `${a.question}: ${a.answer}` : a.answer))
    .join("\n");
}

/**
 * O que mudou entre duas versões do bloco, em linguagem de histórico.
 *
 * O registro da edição precisa dizer O QUE mudou, não apenas que alguém
 * editou: "Informações do lead editadas" sozinho não deixa ninguém auditar
 * nada — e estas respostas viram base de proposta comercial.
 *
 * Compara por pergunta, não por posição: reordenar as linhas não deve virar
 * dez alterações. Perguntas repetidas (o Typeform permite) são comparadas na
 * ordem em que aparecem, agrupando por nome.
 */
export function diffLeadAnswers(before: LeadAnswer[], after: LeadAnswer[]): string[] {
  const agrupar = (lista: LeadAnswer[]) => {
    const mapa = new Map<string, string[]>();
    for (const item of lista) {
      const chave = item.question || "(sem pergunta)";
      mapa.set(chave, [...(mapa.get(chave) ?? []), item.answer]);
    }
    return mapa;
  };

  const antes = agrupar(before);
  const depois = agrupar(after);
  const perguntas = [...new Set([...antes.keys(), ...depois.keys()])];
  const mudancas: string[] = [];

  for (const pergunta of perguntas) {
    const a = antes.get(pergunta) ?? [];
    const d = depois.get(pergunta) ?? [];
    const total = Math.max(a.length, d.length);
    for (let i = 0; i < total; i++) {
      const valorAntes = a[i];
      const valorDepois = d[i];
      if (valorAntes === valorDepois) continue;
      if (valorAntes === undefined) mudancas.push(`${pergunta}: (vazio) → ${valorDepois}`);
      else if (valorDepois === undefined) mudancas.push(`${pergunta}: ${valorAntes} → (removido)`);
      else mudancas.push(`${pergunta}: ${valorAntes} → ${valorDepois}`);
    }
  }

  return mudancas;
}
