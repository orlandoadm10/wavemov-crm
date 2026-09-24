"use client";

import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Menu suspenso. O menu vai para o `body` em `position: fixed`, posicionado
 * pelo gatilho: dentro da página ele ficaria preso aos contêineres que cortam
 * (a `Table` rola de lado, o `<main>` tem `overflow-x-clip`) e, na última linha
 * de uma tabela, aparecia cortado com uma barra de rolagem dentro dela. Abre
 * para cima quando não cabe abaixo e fecha ao rolar ou redimensionar — seguir
 * o gatilho não compensa num menu de poucos itens.
 */
export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Mede antes da pintura: o menu nasce invisível e só aparece já no lugar.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = ref.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const { offsetWidth: width, offsetHeight: height } = menu;
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow || above < VIEWPORT_MARGIN ? below : above;
    const preferredLeft = align === "right" ? anchor.right - width : anchor.left;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    setPosition({ top, left: Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft)) });
  }, [open, align]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            onClick={() => setOpen(false)}
            style={position ?? { top: 0, left: 0, visibility: "hidden" }}
            className={cn(
              "fixed z-40 min-w-44 rounded-xl border border-line bg-white p-1.5 shadow-(--shadow-pop)",
              position && "animate-fade-up"
            )}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

export function DropdownItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-ink-soft hover:bg-slate-50 hover:text-ink"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
