import { cn } from "@/lib/utils";
import Image from "next/image";

/**
 * Logo da JID Mídia — a marca que fornece o CRM.
 *
 * Vive em `components/ui` porque aparece na landing, na autenticação e no
 * formulário público: um lugar só evita que o caminho do arquivo e o texto
 * alternativo se soltem entre as telas. O arquivo é `public/jid.png`, vindo de
 * `referenciasdev/landpage-crm/`.
 */
export function BrandLogo({
  size = 36,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/jid.png"
      alt="JID Mídia"
      width={size}
      height={size}
      priority={priority}
      className={cn("object-contain", className)}
    />
  );
}
