"use client";

// ============================================================
// Badge numérico dos indicadores de atenção.
//
// Substitui o badge que estava inline em `top-nav.tsx` — havia um só, para
// tarefas, e agora são três. Copiá-lo duas vezes garantiria que os três
// divergissem na primeira mudança de tom ou de tamanho.
//
// REGRAS DE DESENHO QUE NÃO SÃO NEGOCIÁVEIS
// - `null` (não sei) e `0` não desenham nada. Zero é afirmação; `null` é
//   ausência de resposta. Nenhum dos dois merece pixel.
// - O pulso é UM, só quando o número SOBE, e nunca na primeira montagem: a
//   tela abrindo com "7" é estado, não chegada.
// - `tabular-nums` para o número não mudar de largura ao trocar de 9 para 10.
// ============================================================
import { formatCount, showsBadge } from "@/lib/features/notifications/domain/attention";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const TONES = {
  primary: "bg-primary-600 text-white",
  rose: "bg-rose-600 text-white",
} as const;

export function CountBadge({
  value,
  label,
  tone = "primary",
}: {
  value: number | null;
  /**
   * Descrição do número em texto, para leitor de tela — "3 tarefas vencidas".
   * O badge visual fica `aria-hidden` porque o número já está aqui; sem isso o
   * leitor anuncia "3" solto logo depois da frase.
   */
  label: string;
  tone?: keyof typeof TONES;
}) {
  const [pulsing, setPulsing] = useState(false);
  // `undefined` = ainda não montou. Diferente de `null`, que é "não sei".
  const anterior = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const antes = anterior.current;
    anterior.current = value;
    // Só a CHEGADA merece atenção. Redução não pulsa: o número caindo é boa
    // notícia e não precisa ser anunciada.
    if (antes === undefined || antes === null || value === null) return;
    if (value <= antes) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  if (!showsBadge(value)) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
          TONES[tone],
          pulsing && "attention-pop"
        )}
      >
        {formatCount(value)}
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
