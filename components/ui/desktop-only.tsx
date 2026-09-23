import { Monitor } from "lucide-react";

/**
 * Conteúdo que só faz sentido no computador (ex.: configuração do WhatsApp,
 * com URL de webhook, token e QR Code). Abaixo de `lg` (1024px) mostra um
 * aviso no lugar.
 *
 * É CSS, não segurança: o conteúdo continua indo no HTML. Quem decide o que
 * a pessoa pode ver é a página; isto só evita uma tela inutilizável no celular.
 */
export function DesktopOnly({
  title = "Disponível no computador",
  description,
  children,
}: {
  title?: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col items-center rounded-2xl border border-line bg-white px-6 py-10 text-center shadow-(--shadow-card) lg:hidden">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Monitor className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-ink-faint">{description}</p>
      </div>
      <div className="hidden lg:block">{children}</div>
    </>
  );
}
