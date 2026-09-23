import { PeopleClient } from "@/components/crm/people-client";
import { StepActions, StepHeading } from "@/components/onboarding/step-actions";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { OrganizationMember } from "@/types";

export const metadata = { title: "Configuração inicial — Equipe" };

// Os papéis explicados antes do formulário: o nome "seller"/"viewer" não diz
// sozinho que o vendedor só enxerga os PRÓPRIOS leads (0011).
const ROLES = [
  { name: "Administrador", text: "Configura funis, integrações, IA e vê a empresa inteira." },
  { name: "Vendedor / Atendente", text: "Trabalha os leads e conversas sob sua responsabilidade." },
  { name: "Leitor", text: "Acompanha tudo, sem alterar nada." },
];

export default async function OnboardingTeamPage() {
  const { organization } = await getSessionContext();
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("*, profile:profiles(*)")
    .eq("organization_id", organization.id)
    .order("created_at");

  return (
    <div className="animate-fade-up space-y-6">
      <StepHeading
        title="Quem vai usar o CRM"
        description="Cadastre sua equipe agora ou depois, em Organização → Pessoas. Cada pessoa entra com e-mail e a senha inicial que você definir."
      />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ROLES.map((r) => (
          <li key={r.name} className="rounded-xl border border-line bg-white p-3">
            <p className="text-sm font-semibold text-ink">{r.name}</p>
            <p className="mt-1 text-xs text-ink-faint">{r.text}</p>
          </li>
        ))}
      </ul>
      <PeopleClient
        organizationId={organization.id}
        organizationName={organization.name}
        members={(members ?? []) as OrganizationMember[]}
        leadCounts={{}}
        canManage
      />
      <StepActions step="equipe" />
    </div>
  );
}
