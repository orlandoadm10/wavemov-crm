"use client";

// ============================================================
// Quem conduz a conversa: IA ou equipe. Botão no cabeçalho do chat e aviso
// de transferência acima do composer. A regra mora na server action; aqui é
// só apresentação e estado de envio.
// ============================================================
import { setConversationHandlingModeAction } from "@/app/(dashboard)/atendimento/actions";
import { Button } from "@/components/ui/button";
import type { HandlingMode } from "@/types";
import { Bot, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function HandlingModeControl({
  conversationId,
  mode,
  canManage,
}: {
  conversationId: string;
  mode: HandlingMode;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAi = mode === "ai";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setConversationHandlingModeAction({
        conversationId,
        mode: isAi ? "human" : "ai",
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!canManage) {
    return (
      <span className="hidden items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-flex">
        {isAi ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
        {isAi ? "IA atendendo" : "Equipe"}
      </span>
    );
  }

  return (
    <div className="relative">
      <Button
        variant={isAi ? "secondary" : "outline"}
        size="sm"
        onClick={toggle}
        loading={pending}
        title={isAi ? "Assumir a conversa (a IA para de responder)" : "Passar a conversa para a IA"}
      >
        {!pending && (isAi ? <Bot className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />)}
        <span className="hidden sm:inline">{isAi ? "IA atendendo · Assumir" : "Passar para IA"}</span>
      </Button>
      {error && (
        <p
          role="alert"
          className="absolute top-full right-0 z-10 mt-1.5 w-64 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive-text shadow-lift"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function HandoffNotice({
  mode,
  reason,
}: {
  mode: HandlingMode;
  reason: string | null | undefined;
}) {
  if (mode === "ai") {
    return (
      <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-violet-50 dark:bg-violet-400/15 px-3 py-1.5 text-xs text-violet-700 dark:text-violet-200">
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        A IA está respondendo esta conversa. Ao enviar uma mensagem, você assume o atendimento.
      </p>
    );
  }
  if (!reason) return null;
  return (
    <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-warning-text">
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Atendimento humano — {reason}
    </p>
  );
}
