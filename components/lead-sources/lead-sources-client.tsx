"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PROVIDERS, type LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConnectSourceModal } from "./connect-source-modal";
import { ProviderIcon } from "./provider-visual";
import type { DestinationFormOption, LeadSourceSummary, MemberOption, PipelineOption } from "./types";

const GALLERY: LeadSourceProvider[] = ["typeform", "webhook", "meta_lead_ads"];

export function LeadSourcesClient({
  sources,
  loadError,
  destinationForms,
  pipelines,
  members,
}: {
  sources: LeadSourceSummary[];
  loadError: boolean;
  destinationForms: DestinationFormOption[];
  pipelines: PipelineOption[];
  members: MemberOption[];
}) {
  const [connecting, setConnecting] = useState<LeadSourceProvider | null>(null);

  return (
    <>
      <section aria-labelledby="conectar-titulo">
        <h2 id="conectar-titulo" className="mb-3 text-sm font-semibold text-ink">
          Conectar uma fonte nova
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {GALLERY.map((id) => {
            const provider = PROVIDERS[id];
            return (
              <button
                key={id}
                type="button"
                disabled={!provider.available}
                onClick={() => setConnecting(id)}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-card p-5 text-left shadow-(--shadow-card) transition hover:border-primary-300 hover:shadow-(--shadow-pop) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line disabled:hover:shadow-(--shadow-card)"
              >
                <div className="flex items-center gap-3">
                  <ProviderIcon provider={id} />
                  <span className="text-sm font-semibold text-ink">{provider.label}</span>
                  {!provider.available && <Badge tone="slate" className="ml-auto">Em breve</Badge>}
                </div>
                <p className="text-xs leading-relaxed text-ink-faint">{provider.description}</p>
                {provider.available && (
                  <span className="mt-auto text-xs font-medium text-primary-600 group-hover:text-primary-700">
                    Conectar →
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader title="Conexões desta empresa" subtitle={`${sources.length} conexão(ões)`} />
        {loadError ? (
          <p role="alert" className="m-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Não foi possível carregar as conexões. Se a migration 0032 ainda não foi aplicada, aplique-a e recarregue.
          </p>
        ) : sources.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">
            Nenhuma conexão ainda. Escolha uma origem acima — leva menos de dois minutos.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {sources.map((source) => (
              <li key={source.id}>
                <Link
                  href={`/fontes/${source.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary-50/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600"
                >
                  <ProviderIcon provider={source.provider} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{source.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {PROVIDERS[source.provider].label} → {source.pipelineName ?? "sem funil"} · {source.formName}
                    </p>
                    {/* No celular o estado desce para baixo do nome. */}
                    <Badge tone={source.status.tone} dot className="mt-1.5 sm:hidden">
                      {source.status.label}
                    </Badge>
                  </div>
                  <Badge tone={source.status.tone} dot className="hidden sm:inline-flex">
                    {source.status.label}
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConnectSourceModal
        provider={connecting}
        onClose={() => setConnecting(null)}
        destinationForms={destinationForms}
        pipelines={pipelines}
        members={members}
      />
    </>
  );
}
