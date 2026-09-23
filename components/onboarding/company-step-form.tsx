"use client";

import { saveCompanyAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { PIPELINE_TEMPLATES } from "@/lib/features/onboarding/domain/pipeline-templates";
import { ArrowRight } from "lucide-react";
import { useActionState } from "react";

// Sugestões, não lista fechada: o segmento é texto livre e alimenta a
// sugestão de funil do passo seguinte.
const SEGMENT_SUGGESTIONS = PIPELINE_TEMPLATES.filter((t) => t.id !== "generico").map((t) => t.label);

export function CompanyStepForm({
  defaults,
}: {
  defaults: { name: string; segment: string; logoUrl: string };
}) {
  const [state, formAction, pending] = useActionState(saveCompanyAction, null);

  return (
    <form action={formAction}>
      <Card className="space-y-5 p-6">
        <div>
          <Label htmlFor="company-name">Nome da empresa</Label>
          <Input
            id="company-name"
            name="name"
            defaultValue={defaults.name}
            minLength={2}
            maxLength={120}
            required
            autoFocus
          />
          <p className="mt-1 text-xs text-ink-faint">
            Aparece para a equipe no menu e nos relatórios.
          </p>
        </div>

        <div>
          <Label htmlFor="company-segment">Segmento</Label>
          <Input
            id="company-segment"
            name="segment"
            list="company-segment-options"
            defaultValue={defaults.segment}
            maxLength={120}
            placeholder="Ex.: Imobiliária, Clínica odontológica, Corretora de seguros"
          />
          <datalist id="company-segment-options">
            {SEGMENT_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-ink-faint">
            Usamos o segmento para sugerir as etapas do seu funil no próximo passo.
          </p>
        </div>

        <div>
          <Label htmlFor="company-logo">Logo (opcional)</Label>
          <Input
            id="company-logo"
            name="logo_url"
            type="url"
            inputMode="url"
            defaultValue={defaults.logoUrl}
            placeholder="https://…/logo.png"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Endereço público de uma imagem quadrada. Aparece no topo do menu.
          </p>
        </div>

        {state?.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}
      </Card>

      <div className="mt-6 flex justify-end">
        <Button type="submit" loading={pending}>
          Salvar e continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
