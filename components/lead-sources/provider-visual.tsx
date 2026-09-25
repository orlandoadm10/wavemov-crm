import type { LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { cn } from "@/lib/utils";
import { ClipboardList, Megaphone, Webhook, type LucideIcon } from "lucide-react";

const VISUAL: Record<LeadSourceProvider, { icon: LucideIcon; className: string }> = {
  typeform: { icon: ClipboardList, className: "bg-violet-50 dark:bg-violet-400/15 text-violet-700 dark:text-violet-200" },
  webhook: { icon: Webhook, className: "bg-cyan-50 dark:bg-cyan-400/15 text-cyan-700 dark:text-cyan-200" },
  meta_lead_ads: { icon: Megaphone, className: "bg-primary-50 text-primary-700" },
};

/** Ícone da origem num quadrado colorido — mesma forma em galeria, lista e detalhe. */
export function ProviderIcon({ provider, size = "md" }: { provider: LeadSourceProvider; size?: "sm" | "md" }) {
  const { icon: Icon, className } = VISUAL[provider];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl",
        size === "md" ? "h-10 w-10" : "h-8 w-8",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
