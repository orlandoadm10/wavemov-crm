"use client";

import { createOrgAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Waves } from "lucide-react";
import { useActionState } from "react";

// Usuário autenticado mas sem organização: cria a primeira empresa. Em
// seguida o assistente de configuração inicial assume (`/onboarding`).
export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrgAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="animate-fade-up w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-(--shadow-card)">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white">
          <Waves className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-ink">Bem-vindo(a)! 👋</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Para começar, crie sua empresa. Em seguida vamos configurar funil,
          equipe e WhatsApp em poucos passos.
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <Field label="Nome da empresa">
            <Input name="organization_name" placeholder="Minha Corretora" required />
          </Field>
          <Field label="Segmento (opcional)">
            <Input name="segment" placeholder="Ex.: Plano de Saúde" />
          </Field>

          {state?.error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" size="lg" loading={pending}>
            Criar empresa e começar
          </Button>
        </form>
      </div>
    </div>
  );
}
