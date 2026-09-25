"use client";

import { CopyField } from "@/components/integrations/copy-field";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SourceSetupGuide } from "./source-setup-guide";

/** Enquanto espera a primeira entrega, a tela se atualiza sozinha. */
const POLL_EVERY_MS = 4_000;
/** E desiste depois de um tempo: aba esquecida aberta não consulta para sempre. */
const POLL_FOR_MS = 15 * 60_000;

export function SourceConnectionCard({
  provider,
  url,
  waiting,
}: {
  provider: LeadSourceProvider;
  url: string | null;
  waiting: boolean;
}) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    setGaveUp(false);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_FOR_MS) {
        clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, POLL_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, router]);

  return (
    <Card className="h-full">
      <CardHeader title="Como conectar" subtitle="Passo 2 de 2 · cole a URL na ferramenta de origem" />
      <div className="space-y-5 p-5">
        {url ? (
          <CopyField label="URL da conexão" value={url} />
        ) : (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
            Esta conexão está sem URL. Use &quot;Gerar URL nova&quot; em Configurações.
          </p>
        )}
        <p className="-mt-3 text-xs text-ink-faint">
          Trate a URL como senha: quem a tem cria leads nesta empresa.
        </p>

        <SourceSetupGuide provider={provider} />

        {waiting && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center gap-3 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-warning-text"
          >
            {gaveUp ? (
              <>
                <span className="flex-1">Nenhuma entrega ainda. Parei de verificar automaticamente.</span>
                <Button size="sm" variant="outline" onClick={() => router.refresh()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Verificar agora
                </Button>
              </>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                </span>
                <span className="flex-1">
                  Aguardando a primeira entrega… esta tela atualiza sozinha quando o teste chegar.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
