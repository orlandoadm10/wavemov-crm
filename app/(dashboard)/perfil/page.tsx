import { ProfileClient } from "@/components/crm/profile-client";
import { getSessionContext } from "@/lib/services/session";

export const metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const session = await getSessionContext();
  return (
    <div className="animate-fade-up">
      <ProfileClient profile={session.profile} />
    </div>
  );
}
