import { TopNav } from "@/components/layout/top-nav";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  const supabase = await createClient();

  const { count: pendingTasks } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organization.id)
    .eq("status", "pending");

  return (
    <div className="min-h-screen">
      <TopNav session={session} pendingTasks={pendingTasks ?? 0} />
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
    </div>
  );
}
