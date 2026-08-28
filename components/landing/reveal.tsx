"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Revela o conteúdo quando ele entra na viewport, uma única vez.
 *
 * É um wrapper de apresentação: o conteúdo continua renderizado no HTML do
 * servidor (só a opacidade muda), então a landing permanece legível sem JS e
 * indexável. `prefers-reduced-motion` é respeitado pelo CSS em `globals.css`.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-in", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
