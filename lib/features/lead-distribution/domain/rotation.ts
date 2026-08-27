/**
 * O rodízio ponderado — regra pura, sem banco e sem framework.
 *
 * Duas responsabilidades: montar a sequência de quem recebe, e dizer quem é a
 * vez dado o bilhete. Nada aqui guarda estado: o estado é o contador
 * `lead_distribution_rules.assignments_count`, incrementado atomicamente no
 * Postgres (migration 0016).
 */

export interface RotationParticipant {
  profileId: string;
  name: string;
  weight: number;
}

/**
 * A ordem em que os participantes recebem, expandida pelo peso.
 *
 * INTERCALADA, não em blocos. Expandir cada pessoa de uma vez
 * (`A,A,A,B`) dá a proporção certa mas entrega três leads seguidos ao mesmo
 * vendedor e depois o silencia — o que, numa operação em que o tempo até o
 * primeiro contato é o ativo, concentra a fila numa pessoa só. Distribuindo em
 * passadas (`A,B,A`) a proporção é idêntica e o intervalo entre leads da mesma
 * pessoa é o maior possível.
 *
 * A ordenação por `profileId` existe para a sequência ser DETERMINÍSTICA: o
 * mesmo bilhete com os mesmos participantes sempre resolve a mesma pessoa, que
 * é o que torna a auditoria verificável depois.
 */
export function buildRotationSequence(participants: RotationParticipant[]): string[] {
  const ordenados = [...participants]
    .filter((p) => p.weight > 0)
    .sort((a, b) => a.profileId.localeCompare(b.profileId));

  if (ordenados.length === 0) return [];

  const maiorPeso = Math.max(...ordenados.map((p) => p.weight));
  const sequencia: string[] = [];
  for (let passada = 0; passada < maiorPeso; passada++) {
    for (const participante of ordenados) {
      if (participante.weight > passada) sequencia.push(participante.profileId);
    }
  }
  return sequencia;
}

/**
 * De quem é a vez.
 *
 * O bilhete vem do contador do banco e só cresce; o resto pela largura da
 * sequência dá a posição. `ticket - 1` porque o `update ... returning` devolve
 * o valor JÁ incrementado — o primeiro lead recebe o bilhete 1 e tem de cair
 * na primeira posição.
 */
export function pickByTicket(sequence: string[], ticket: number): string | null {
  if (sequence.length === 0) return null;
  const posicao = ((ticket - 1) % sequence.length + sequence.length) % sequence.length;
  return sequence[posicao];
}
