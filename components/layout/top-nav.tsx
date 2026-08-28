"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { cn, fullName } from "@/lib/utils";
import type { SessionContext } from "@/types";
import { Building2, LogOut, Menu, UserCircle, Waves, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NAV_ITEMS } from "./nav-links";

export function TopNav({
  session,
  pendingTasks,
}: {
  session: SessionContext;
  pendingTasks: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, startTransition] = useTransition();

  const items = NAV_ITEMS.filter((item) => {
    if ("globalAdminOnly" in item && item.globalAdminOnly && !session.profile.is_global_admin) {
      return false;
    }
    if (
      "orgAdminOnly" in item &&
      item.orgAdminOnly &&
      session.membership.role !== "org_admin" &&
      !session.profile.is_global_admin
    ) {
      return false;
    }
    return true;
  });

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

  const navLink = (item: (typeof NAV_ITEMS)[number], mobile = false) => {
    const active = pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2 rounded-lg text-sm font-medium transition-colors",
          mobile ? "px-4 py-3" : "px-3 py-2",
          active
            ? "bg-primary-50 text-primary-700"
            : "text-ink-soft hover:bg-slate-50 hover:text-ink"
        )}
      >
        <Icon className={cn("h-4 w-4", active ? "text-primary-600" : "text-ink-faint")} />
        {item.label}
        {item.href === "/tarefas" && pendingTasks > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
            {pendingTasks}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4">
        {/* Marca / organização ativa */}
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 pr-2">
          {session.organization.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.organization.logo_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 text-white">
              <Waves className="h-4.5 w-4.5" />
            </span>
          )}
          <span className="truncate text-sm font-bold text-ink">
            {session.organization.name}
          </span>
        </Link>

        {/* Navegação desktop */}
        <nav className="ml-2 hidden flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
          {items.map((i) => navLink(i))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Menu do usuário */}
          <Dropdown
            trigger={
              <button className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100">
                <Avatar
                  name={fullName(session.profile)}
                  src={session.profile.avatar_url}
                  size="sm"
                />
              </button>
            }
          >
            <div className="border-b border-line px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-ink">
                {fullName(session.profile)}
              </p>
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
                    <span className={cn("truncate", org.id === session.organization.id && "font-semibold text-primary-700")}>
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

          {/* Toggle mobile */}
          <button
            className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Navegação mobile */}
      {mobileOpen && (
        <nav className="animate-fade-up border-t border-line bg-white px-2 py-2 lg:hidden">
          {items.map((i) => navLink(i, true))}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </nav>
      )}
    </header>
  );
}
