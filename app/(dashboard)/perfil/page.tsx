import { ChangePasswordCard } from "@/components/crm/change-password-card";
import { ProfileClient } from "@/components/crm/profile-client";
import { getSessionContext } from "@/lib/services/session";

export const metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await getSessionContext();
  return (
    <div className="animate-fade-up space-y-4">
      <ProfileClient profile={session.profile} />
      <div className="mx-auto max-w-2xl">
        <ChangePasswordCard />
      </div>
    </div>
  );
}
