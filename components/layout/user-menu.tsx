"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { cn, fullName } from "@/lib/utils";
import type { SessionContext } from "@/types";
import { Building2, ChevronDown, LogOut, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const ROLE_LABEL: Record<string, string> = {
  org_admin: "Administrador",
  seller: "Vendedor",
  agent: "Atendente",
  viewer: "Visualizador",
};

/** Conta da pessoa: perfil, troca de empresa e saída. */
export function UserMenu({ session }: { session: SessionContext }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function switchOrg(orgId: string) {
    await fetch("/api/session/org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: orgId }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  async function logout() {
    await fetch("/api/session/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const name = fullName(session.profile);
  const role = session.profile.is_global_admin
    ? "Admin global"
    : (ROLE_LABEL[session.membership.role] ?? session.membership.role);

  return (
    <div className="flex items-center gap-1.5">
      <Dropdown
        trigger={
          <button
            type="button"
            aria-label="Menu da conta"
            // Pílula do usuário (print 5): avatar, nome · papel.
            className="flex items-center gap-2 rounded-full border border-primary/25 bg-secondary/80 p-1 transition-colors hover:bg-accent sm:pr-3"
          >
            <Avatar name={name} src={session.profile.avatar_url} size="sm" />
            <span className="hidden max-w-56 truncate text-sm font-medium text-secondary-foreground sm:block">
              {name} <span className="text-primary">· {role}</span>
            </span>
            <ChevronDown aria-hidden className="hidden h-3.5 w-3.5 text-secondary-foreground/70 sm:block" />
          </button>
        }
      >
        <div className="border-b border-line px-3 py-2.5">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="truncate text-xs text-ink-faint">{session.profile.email}</p>
        </div>
        <div className="py-1">
          <DropdownItem
            icon={<UserCircle className="h-4 w-4" />}
            onClick={() => router.push("/perfil")}
          >
            Meu perfil
          </DropdownItem>
        </div>
        {session.organizations.length > 1 && (
          <div className="border-t border-line py-1">
            <p className="px-3 py-1.5 text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
              Trocar empresa
            </p>
            {session.organizations.slice(0, 8).map((org) => (
              <DropdownItem
                key={org.id}
                icon={<Building2 className="h-4 w-4" />}
                onClick={() => switchOrg(org.id)}
              >
                <span
                  className={cn(
                    "truncate",
                    org.id === session.organization.id && "font-semibold text-primary"
                  )}
                >
                  {org.name}
                </span>
              </DropdownItem>
            ))}
          </div>
        )}
        <div className="border-t border-line py-1">
          <DropdownItem danger icon={<LogOut className="h-4 w-4" />} onClick={logout}>
            Sair
          </DropdownItem>
        </div>
      </Dropdown>
      <button
        type="button"
        onClick={logout}
        aria-label="Sair"
        title="Sair"
        className="hidden h-9 w-9 items-center justify-center rounded-full text-chrome-soft transition-colors hover:bg-chrome-soft hover:text-chrome sm:flex"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
