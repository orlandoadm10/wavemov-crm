import { TasksClient } from "@/components/crm/tasks-client";
import { PageHeader } from "@/components/layout/page-header";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import type { Contact, Deal, Profile, Task } from "@/types";

export const metadata = { title: "Tarefas" };
export const dynamic = "force-dynamic";

export default async function TarefasPage() {
  const session = await getSessionContext();
  const supabase = await createClient();
  const orgId = session.organization.id;

  const [{ data: tasksRaw }, { data: membersRaw }, { data: dealsRaw }, { data: contactsRaw }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("organization_id", orgId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(500),
      supabase
        .from("organization_members")
        .select("profile:profiles(*)")
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("deals")
        .select("id, title, organization_id, pipeline_id, stage_id, status, value, temperature, ai_status, created_at, updated_at, contact:contacts(name, phone, whatsapp_phone)")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("contacts").select("*").eq("organization_id", orgId).order("name").limit(500),
    ]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Tarefas" subtitle="Acompanhe follow-ups e atividades da equipe" />
      <TasksClient
        organizationId={orgId}
        profileId={session.profile.id}
        tasks={(tasksRaw ?? []) as Task[]}
        members={((membersRaw ?? []) as unknown as { profile: Profile }[]).map((m) => m.profile)}
        deals={(dealsRaw ?? []) as unknown as Deal[]}
        contacts={(contactsRaw ?? []) as Contact[]}
      />
    </div>
  );
}
