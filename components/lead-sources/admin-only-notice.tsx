import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Lock } from "lucide-react";
import Link from "next/link";

/** O que vendedor, atendente e visualizador veem em `/fontes`. */
export function AdminOnlyNotice() {
  return (
    <div className="animate-fade-up">
      <PageHeader title="Fontes de lead" />
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Restrito ao administrador da empresa"
        description="A URL de uma conexão cria leads nesta empresa. Peça ao administrador se precisar conectar uma nova origem."
        action={
          <Link href="/dashboard" className={buttonClasses({ variant: "outline" })}>
            Voltar ao dashboard
          </Link>
        }
      />
    </div>
  );
}
