import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDateTime } from "@/lib/utils";
import type { ConversationThreadMessage } from "@/types";
import { Bot, CheckCheck, Clock, Paperclip, Workflow } from "lucide-react";

interface Props {
  messages: ConversationThreadMessage[];
  loading?: boolean;
  emptyMessage?: string;
}

export function MessageThread({
  messages,
  loading = false,
  emptyMessage = "Nenhuma mensagem nesta conversa ainda.",
}: Props) {
  if (loading) {
    return (
      <div className="space-y-3 py-3" aria-label="Carregando mensagens">
        <Skeleton className="h-16 w-3/5 rounded-2xl" />
        <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl" />
        <Skeleton className="h-14 w-1/2 rounded-2xl" />
      </div>
    );
  }

  if (messages.length === 0) {
    return <p className="py-10 text-center text-xs text-ink-faint">{emptyMessage}</p>;
  }

  return messages.map((message) =>
    message.message_type === "system" ? (
      <div key={message.id} className="flex justify-center">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-700 ring-1 ring-amber-100">
          {message.content ?? "Evento interno"}
        </span>
      </div>
    ) : (
      <div
        key={message.id}
        className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}
      >
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%]",
            message.direction === "outbound"
              ? "rounded-br-md bg-primary-600 text-white"
              : "rounded-bl-md border border-line bg-white text-ink"
          )}
        >
          {message.media_url && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "mb-1 flex items-center gap-1 text-xs underline",
                message.direction === "outbound" ? "text-primary-100" : "text-primary-600"
              )}
            >
              <Paperclip className="h-3 w-3" />
              Mídia ({message.message_type})
            </a>
          )}
          <p className="whitespace-pre-wrap">{message.content ?? `[${message.message_type}]`}</p>
          <p
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              message.direction === "outbound" ? "text-primary-200" : "text-ink-faint"
            )}
          >
            {message.sender_type === "ai" && (
              <span className="mr-1 inline-flex items-center gap-0.5 font-semibold">
                <Bot className="h-3 w-3" aria-hidden /> IA
              </span>
            )}
            {message.sender_type === "automation" && (
              <span className="mr-1 inline-flex items-center gap-0.5 font-semibold">
                <Workflow className="h-3 w-3" aria-hidden /> Automação
              </span>
            )}
            {formatDateTime(message.created_at)}
            {message.direction === "outbound" &&
              (message.delivery_status === "pending" ? (
                <Clock className="h-3 w-3" aria-label="Enviando" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              ))}
          </p>
        </div>
      </div>
    )
  );
}
