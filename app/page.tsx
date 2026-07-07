import { redirect } from "next/navigation";

// O middleware redireciona autenticados para /dashboard.
// Visitantes caem no login.
export default function Home() {
  redirect("/login");
}
