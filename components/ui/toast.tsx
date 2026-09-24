"use client";

// ============================================================
// Toast — aviso efêmero, canto inferior direito.
//
// Nasceu para um caso só: o lead que acabou de entrar e é seu (ou está sem
// responsável). Não é um sistema de mensagens de sucesso/erro — o projeto já
// resolve erro de escrita no lugar onde a escrita acontece, com
// `describeWriteError`, e trocar isso por toast esconderia o erro do campo que
// o causou.
//
// POR QUE NÃO ENTROU BIBLIOTECA
// Um toast é uma lista, um timer e uma região `aria-live`. Trazer um pacote
// para isso custaria bundle em todas as telas autenticadas e uma dependência
// nova a justificar — o padrão do projeto pede justificativa, e aqui não há.
//
// ACESSIBILIDADE
// A região é `polite` e `atomic`, nunca `assertive`: nada aqui justifica
// interromper quem está lendo outra coisa. O toast NÃO rouba foco — ele é
// informativo e some sozinho; roubar foco de quem está digitando uma proposta
// para anunciar um lead seria hostil. Quem usa teclado alcança o link pela
// ordem natural, e quem ignora não perde nada: o badge continua contando.
// ============================================================
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  /** Quando presente, o corpo do toast vira link para cá. */
  href?: string;
}

/** Tempo em tela. Curto o bastante para não acumular, longo para ser lido. */
const TOAST_MS = 8000;

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      // A região existe mesmo vazia: `aria-live` só é anunciado quando o
      // conteúdo muda DENTRO de um nó que o leitor já está observando. Montar
      // a região junto com o texto costuma resultar em silêncio.
      // `z-60`, acima do modal e da gaveta (`z-50`): no mesmo nível, o portal
      // do modal entra depois no DOM e escondia o aviso sob o fundo escuro.
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-60 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const corpo = (
    <>
      <p className="text-sm font-semibold text-ink">{toast.title}</p>
      {toast.description && (
        <p className="mt-0.5 truncate text-xs text-ink-soft">{toast.description}</p>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-lg",
        "animate-toast-in"
      )}
    >
      <div className="min-w-0 flex-1">
        {toast.href ? (
          <Link href={toast.href} onClick={() => onDismiss(toast.id)} className="block">
            {corpo}
          </Link>
        ) : (
          corpo
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar aviso"
        className="rounded-md p-1 text-ink-faint transition-colors hover:bg-slate-50 hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
