// ============================================================
// Nome do lead a partir de uma mensagem de WhatsApp.
//
// O DEFEITO QUE ISTO FECHA (medido em 23/09/2026): quando a primeira mensagem
// de uma conversa era ENVIADA pelo celular da equipe (`fromMe`), o nome do
// remetente no payload é o do DONO do número — e o contato do lead nascia com
// ele. A base da JID tinha 37 contatos chamados "Orlando Lima", cada um com um
// telefone diferente, e 9 com nome vazio (remetente sem nome: `""` passava
// pelo `??`).
//
// Regras:
// - mensagem `fromMe` nunca dá nome ao lead;
// - nome vazio ou só espaços é ausência de nome;
// - um nome real substitui um PLACEHOLDER (vazio, "WhatsApp +55…", telefone
//   puro), nunca um nome que alguém da equipe digitou.
// ============================================================

export function leadNameFromMessage(msg: { fromMe: boolean; senderName: string | null }): string | null {
  if (msg.fromMe) return null;
  const name = msg.senderName?.trim();
  return name ? name.slice(0, 120) : null;
}

const PLACEHOLDER_PATTERNS = [/^whatsapp \+?\d+$/i, /^lead whatsapp \+?\d+$/i, /^\+?\d[\d\s-]*$/];

export function isPlaceholderName(name: string | null | undefined): boolean {
  const value = name?.trim() ?? "";
  if (!value) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}
