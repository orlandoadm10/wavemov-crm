"use client";

import type { AiAgent, KnowledgeDocument } from "@/types";
import { cn } from "@/lib/utils";
import { Activity, BookOpen, Bot } from "lucide-react";
import { useState } from "react";
import { AgentsPanel } from "./agents-panel";
import { AiRunsTable, type AiRunRow } from "./ai-runs-table";
import { KnowledgePanel } from "./knowledge-panel";

type Tab = "agents" | "knowledge" | "activity";

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: "agents", label: "Agentes", icon: Bot },
  { id: "knowledge", label: "Base de conhecimento", icon: BookOpen },
  { id: "activity", label: "Atividade", icon: Activity },
];

export function AiWorkspace({
  agents,
  documents,
  runs,
  defaultModel,
  embeddingsReady,
}: {
  agents: AiAgent[];
  documents: KnowledgeDocument[];
  runs: AiRunRow[];
  defaultModel: string;
  embeddingsReady: boolean;
}) {
  const [tab, setTab] = useState<Tab>("agents");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Seções da IA"
        className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1.5 shadow-(--shadow-card)"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === id ? "bg-primary-50 text-primary-700" : "text-ink-soft hover:bg-slate-50 hover:text-ink"
            )}
          >
            <Icon className={cn("h-4 w-4", tab === id ? "text-primary-600" : "text-ink-faint")} />
            {label}
          </button>
        ))}
      </div>

      {tab === "agents" && <AgentsPanel agents={agents} defaultModel={defaultModel} />}
      {tab === "knowledge" && (
        <KnowledgePanel documents={documents} agents={agents} embeddingsReady={embeddingsReady} />
      )}
      {tab === "activity" && <AiRunsTable runs={runs} />}
    </div>
  );
}
