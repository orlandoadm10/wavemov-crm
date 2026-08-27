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
  /** O resto do `metadata`: ids da origem, enriquecimento, UTM. */
  extras: LeadAnswer[];
}

/**
 * Uma linha do bloco vira pergunta + resposta pelo PRIMEIRO `: `.
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

  const separator = trimmed.indexOf(": ");
  if (separator === -1) return { question: "", answer: trimmed };

  const question = trimmed.slice(0, separator).trim();
  const answer = trimmed.slice(separator + 2).trim();
  if (!answer) return null;
  return { question, answer };
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

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { answers, extras };
  }

  for (const [key, rawValue] of Object.entries(metadata as Record<string, unknown>)) {
    if (rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue).trim();
    if (!value) continue;

    const lines = value.split("\n").filter((l) => l.trim());
    const isAnswerBlock = lines.length > 1 && lines.every((l) => l.includes(": "));

    if (isAnswerBlock) {
      for (const line of lines) {
        const parsed = parseAnswerLine(line);
        if (parsed) answers.push(parsed);
      }
    } else {
      extras.push({ question: humanizeKey(key), answer: value });
    }
  }

  return { answers, extras };
}

/** Há algo que valha desenhar? Evita renderizar um card vazio. */
export function hasLeadInfo(info: LeadInfo): boolean {
  return info.answers.length > 0 || info.extras.length > 0;
}
