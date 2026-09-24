"use client";

import { useAnchoredPosition } from "@/hooks/use-anchored-position";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Menu suspenso. O menu vai para o `body` num portal, posicionado pelo gatilho
 * (`useAnchoredPosition`): dentro da página ele ficava preso aos contêineres
 * que cortam — na última linha de uma `Table`, cortado e com rolagem interna.
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
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(open, ref, menuRef, align);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
              "fixed z-40 min-w-44 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-(--shadow-pop)",
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
