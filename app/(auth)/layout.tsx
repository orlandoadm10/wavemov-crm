import { BrandLogo } from "@/components/ui/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Painel de marca (desktop) */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-primary-900 p-10 lg:flex">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px circle at 20% 20%, #2563eb55, transparent 60%), radial-gradient(800px circle at 80% 80%, #1d4ed855, transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white p-1.5">
            <BrandLogo size={28} />
          </span>
          <span className="text-lg font-bold text-white">CRM JID Mídia</span>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-3xl leading-tight font-bold text-white">
            Todo o seu funil de vendas, tarefas e WhatsApp em um só lugar.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-200">
            CRM multiempresa com Kanban de negociações, formulários de captura,
            dashboard de performance e atendimento integrado ao WhatsApp.
          </p>
        </div>
        <p className="relative text-xs text-primary-300">
          © {new Date().getFullYear()} JID Mídia. Todos os direitos reservados.
        </p>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
