import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, fullName } from "@/lib/utils";
import type { OrganizationMember } from "@/types";
import { BadgeCheck, Mail, UserCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "Perfil da empresa" };
export const dynamic = "force-dynamic";

export default async function EmpresaPerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionContext();
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();

  const [{ data: membersRaw }, { data: deals }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*, profile:profiles(*)")
      .eq("organization_id", id)
      .order("created_at"),
    supabase.from("deals").select("status, value").eq("organization_id", id),
  ]);

  const members = (membersRaw ?? []) as OrganizationMember[];
  const owner = members.find((m) => m.role === "org_admin");
  const allDeals = deals ?? [];
  const won = allDeals.filter((d) => d.status === "won");
  const lost = allDeals.filter((d) => d.status === "lost");
  const soldValue = won.reduce((s, d) => s + Number(d.value), 0);

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <PageHeader
        title={org.name}
        subtitle="Perfil da empresa"
        actions={
          <Link
            href="/empresas"
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-primary-700"
          >
            ← Voltar para empresas
          </Link>
        }
      />

      {/* Card da empresa */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={org.name} src={org.logo_url} size="xl" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-ink">{org.name}</h2>
              <BadgeCheck className="h-5 w-5 text-primary-500" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              {org.owner_name && (
                <span className="flex items-center gap-1.5">
                  <UserCircle className="h-4 w-4 text-ink-faint" />
                  {org.owner_name}
                </span>
              )}
              {owner?.profile?.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-ink-faint" />
                  {owner.profile.email}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-primary-600">
              UniqueID: <span className="font-mono">{org.id}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Indicadores */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads" value={allDeals.length} tone="blue" />
        <StatCard label="Negócios ganhos" value={won.length} tone="green" />
        <StatCard label="Negócios perdidos" value={lost.length} tone="red" />
        <StatCard
          label="Valor vendido"
          value={<span className="text-xl">{formatCurrency(soldValue)}</span>}
          tone="green"
        />
      </div>

      {/* Pessoas */}
      <Card className="mt-4">
        <CardHeader title="Pessoas" subtitle={`${members.length} pessoa(s) vinculada(s)`} />
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={fullName(m.profile)} src={m.profile?.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{fullName(m.profile)}</p>
                <p className="truncate text-xs text-ink-faint">
                  {m.profile?.job_title ?? m.profile?.email}
                </p>
              </div>
              <RoleBadge role={m.role} />
            </li>
          ))}
          {members.length === 0 && (
            <li className="px-5 py-6 text-sm text-ink-faint">Nenhuma pessoa vinculada.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
