"use client";

import { DealActivityTimeline } from "@/components/crm/deal-activity-timeline";
import { DealConversationHistory } from "@/components/crm/deal-conversation-history";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ActivityLog, WhatsAppConversation } from "@/types";
import { History, MessageCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type KeyboardEvent } from "react";

type HistoryTab = "activities" | "conversations";

interface Props {
  organizationId: string;
  activities: ActivityLog[];
  activitiesError: string | null;
  conversations: WhatsAppConversation[];
  conversationsError: string | null;
}

const tabs: HistoryTab[] = ["activities", "conversations"];

export function DealHistoryPanel({
  organizationId,
  activities,
  activitiesError,
  conversations,
  conversationsError,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<HistoryTab>("activities");
  const [conversationsOpened, setConversationsOpened] = useState(false);
  const tabRefs = useRef<Record<HistoryTab, HTMLButtonElement | null>>({
    activities: null,
    conversations: null,
  });

  function activateFromKeyboard(current: HistoryTab, event: KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    const currentIndex = tabs.indexOf(current);
    const nextIndex =
      key === "ArrowRight"
        ? (currentIndex + 1) % tabs.length
        : key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : key === "Home"
            ? 0
            : key === "End"
              ? tabs.length - 1
              : -1;

    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    activateTab(next);
    tabRefs.current[next]?.focus();
  }

  function activateTab(tab: HistoryTab) {
    setActiveTab(tab);
    if (tab === "conversations") setConversationsOpened(true);
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="pb-3">
          <h2 className="font-sans text-sm font-semibold text-ink">Histórico do lead</h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Operação comercial e conversas ficam separadas para facilitar a leitura.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Histórico do lead"
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:flex"
        >
          <button
            ref={(element) => {
              tabRefs.current.activities = element;
            }}
            id="deal-history-tab-activities"
            type="button"
            role="tab"
            aria-selected={activeTab === "activities"}
            aria-controls="deal-history-panel-activities"
            tabIndex={activeTab === "activities" ? 0 : -1}
            onClick={() => activateTab("activities")}
            onKeyDown={(event) => activateFromKeyboard("activities", event)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
              activeTab === "activities"
                ? "bg-card text-primary-700 shadow-sm"
                : "text-ink-faint hover:text-ink-soft"
            )}
          >
            <History className="h-3.5 w-3.5" />
            Atividades
          </button>
          <button
            ref={(element) => {
              tabRefs.current.conversations = element;
            }}
            id="deal-history-tab-conversations"
            type="button"
            role="tab"
            aria-selected={activeTab === "conversations"}
            aria-controls="deal-history-panel-conversations"
            tabIndex={activeTab === "conversations" ? 0 : -1}
            onClick={() => activateTab("conversations")}
            onKeyDown={(event) => activateFromKeyboard("conversations", event)}
            className={cn(
              "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
              activeTab === "conversations"
                ? "bg-card text-primary-700 shadow-sm"
                : "text-ink-faint hover:text-ink-soft"
            )}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Conversas{conversationsError ? "" : ` (${conversations.length})`}
          </button>
        </div>
      </div>

      <div
        id="deal-history-panel-activities"
        role="tabpanel"
        aria-labelledby="deal-history-tab-activities"
        hidden={activeTab !== "activities"}
      >
        {activitiesError ? (
          <HistorySectionError message={activitiesError} onRetry={() => router.refresh()} />
        ) : (
          <DealActivityTimeline activities={activities} />
        )}
      </div>

      <div
        id="deal-history-panel-conversations"
        role="tabpanel"
        aria-labelledby="deal-history-tab-conversations"
        hidden={activeTab !== "conversations"}
      >
        {conversationsOpened &&
          (conversationsError ? (
            <HistorySectionError message={conversationsError} onRetry={() => router.refresh()} />
          ) : (
            <DealConversationHistory
              organizationId={organizationId}
              conversations={conversations}
              active={activeTab === "conversations"}
            />
          ))}
      </div>
    </Card>
  );
}

function HistorySectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
      <p role="alert" className="text-sm text-destructive-text">
        {message}
      </p>
      <Button className="mt-3" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Tentar novamente
      </Button>
    </div>
  );
}
