"use client";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-soft">{label}</p>
      <div className="flex gap-2">
        <code className="flex h-10 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-line bg-muted/50 px-3.5 text-xs whitespace-nowrap text-ink">
          {value}
        </code>
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={copied ? "Copiado" : `Copiar ${label}`}>
          {copied ? <Check className="h-4 w-4 text-success-text" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
