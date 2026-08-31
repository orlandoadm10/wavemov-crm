import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value ?? 0);
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(date)
  );
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function fullName(p?: { first_name?: string | null; last_name?: string | null } | null) {
  if (!p) return "—";
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return name || "—";
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

// Normaliza telefone para o formato usado pelo WhatsApp (só dígitos, com DDI)
export function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function daysSince(date: string | Date | null | undefined) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Mensagem de erro de escrita para o usuário, em português.
 *
 * O erro do PostgREST vem em inglês e com jargão de banco ("violates not-null
 * constraint", "new row violates row-level security policy"): não ajuda quem
 * usa o CRM e ainda expõe detalhe de schema. O objeto inteiro vai para o
 * console porque `code`, `details` e `hint` são onde está o motivo acionável.
 */
export function describeWriteError(err: unknown, fallback: string) {
  if (err) console.error(fallback, err);

  // Violação de unicidade é o único caso em que o banco sabe algo que a tela
  // não sabe e que o usuário CONSEGUE resolver sozinho. O texto genérico
  // levaria a pessoa a tentar de novo, com o mesmo resultado — e a `0024`
  // tornou isso comum: cadastrar um contato com WhatsApp já existente na
  // empresa passa a ser recusado, em vez de criar a duplicata silenciosa que
  // multiplicou 59 telefones em 246 contatos.
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "23505") {
    const constraint = String((err as { message?: unknown }).message ?? "");
    if (constraint.includes("contacts_org_whatsapp_key")) {
      return "Já existe um contato com este WhatsApp nesta empresa. Procure por ele na lista de contatos em vez de criar outro.";
    }
    return "Já existe um registro com estes dados nesta empresa.";
  }

  return fallback;
}

/**
 * Primeira etapa aberta de um funil, na ordem em que o usuário a enxerga.
 *
 * "Aberta" exclui as etapas de ganho e perda: fechar negociação é ato
 * deliberado, com confirmação e motivo, e nunca efeito colateral de mover o
 * lead. É o destino usado ao trocar um lead de funil e ao criar lead sem
 * escolha explícita de etapa — e devolve `null` quando o funil só tem etapas
 * de fechamento, caso em que o chamador precisa recusar antes de gravar.
 */
export function firstOpenStage<T extends { order_index: number; is_won_stage: boolean; is_lost_stage: boolean }>(
  stages: T[] | null | undefined
): T | null {
  return (
    [...(stages ?? [])]
      .filter((s) => !s.is_won_stage && !s.is_lost_stage)
      .sort((a, b) => a.order_index - b.order_index)[0] ?? null
  );
}
