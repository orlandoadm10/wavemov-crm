/**
 * A fila ordenada — regra pura, sem banco e sem framework.
 *
 * O administrador define a ordem; cada pessoa tem um peso, que é quantos leads
 * CONSECUTIVOS ela recebe antes de a fila avançar. Quem não está de plantão
 * simplesmente não chega aqui: o chamador entrega a fila já filtrada, e é isso
 * que faz o ausente ser pulado sem que a posição de ninguém mude.
 *
 * Substituiu a sequência derivada da 0016 (participantes ordenados por UUID,
 * expandidos pelo peso, escolhidos por `ticket % n`). Aquela tinha dois
 * defeitos que só apareciam na operação: a ordem não era escolhível, e tirar
 * uma pessoa mudava a largura da sequência — remapeando todo mundo justamente
 * no dia em que alguém faltava.
 */

export interface QueueParticipant {
  profileId: string;
  name: string;
  /** Quantos leads consecutivos antes de a fila avançar (1..100). */
  weight: number;
  /** Ordem manual dentro da regra, crescente. */
  position: number;
}

/** O que fica persistido na regra entre um lead e o seguinte. */
export interface QueueCursor {
  /** Posição do último servido. `-1` = ninguém ainda. */
  position: number;
  /** Quantos leads consecutivos a posição atual já consumiu do peso dela. */
  uses: number;
}

export interface QueuePick {
  participant: QueueParticipant;
  /** Cursor a gravar depois de entregar este lead. */
  next: QueueCursor;
}

/** Cursor de uma regra que ainda não distribuiu nada. */
export const INITIAL_CURSOR: QueueCursor = { position: -1, uses: 0 };

/**
 * De quem é a vez.
 *
 * `queue` precisa vir **já filtrada** (só quem está de plantão e ativo). A
 * ordenação é refeita aqui de qualquer forma, porque depender da ordem que o
 * banco devolveu é o tipo de suposição que quebra quando alguém mexe na
 * consulta.
 *
 * Devolve `null` quando não há ninguém elegível. O chamador registra
 * `no_candidates` e deixa o lead entrar sem responsável — perder o lead seria
 * pior.
 */
export function pickNext(queue: QueueParticipant[], cursor: QueueCursor): QueuePick | null {
  const fila = [...queue].sort((a, b) => a.position - b.position);
  if (fila.length === 0) return null;

  // Ainda é a vez de quem está na posição do cursor?
  //
  // Só se essa pessoa continuar elegível: se ela saiu do plantão no meio do
  // peso dela, a vez passa adiante em vez de o lead ficar preso esperando
  // alguém que não está trabalhando.
  const atual = fila.find((p) => p.position === cursor.position);
  if (atual && cursor.uses < atual.weight) {
    return { participant: atual, next: { position: atual.position, uses: cursor.uses + 1 } };
  }

  // Avança para a próxima posição elegível DEPOIS da atual; não havendo, dá a
  // volta. Comparar por POSIÇÃO, e não por índice na lista, é o que faz o
  // ausente ser pulado sem deslocar ninguém: quem está fora do plantão some da
  // lista, mas as posições dos outros continuam as mesmas.
  const proximo = fila.find((p) => p.position > cursor.position) ?? fila[0];
  return { participant: proximo, next: { position: proximo.position, uses: 1 } };
}
