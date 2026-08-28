import { Dashboards } from "@/components/landing/dashboards";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { Management } from "@/components/landing/management";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import type { Metadata } from "next";

const TITLE = "CRM JID Mídia — Organize seus leads e acompanhe cada negociação";
const DESCRIPTION =
  "Negociações, tarefas, contatos, empresas, formulários, atendimentos e WhatsApp em um único ambiente. Acesse a plataforma da sua equipe.";

// A URL do site. `/` é prerenderizada, então canonical e `og:url` são assados
// no build: sem a variável, é melhor não emitir URL nenhuma do que publicar um
// canonical apontando para o lugar errado — isso pede a desindexação da URL
// real. Não basta deixar `metadataBase` indefinida: o Next tem fallback
// próprio (localhost, ou o domínio de deploy da Vercel), e é ele que assaria o
// endereço errado.
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  // `absolute` porque o template do layout raiz já acrescenta a marca, e a
  // landing precisa do nome completo do produto no início do título.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...(SITE_URL ? { alternates: { canonical: "/" } } : {}),
  // É a única página compartilhável do produto: sem isto, um link colado no
  // WhatsApp ou no LinkedIn não rende card nenhum. Falta a imagem — enquanto
  // não houver arte, o card sai sem miniatura.
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "CRM JID Mídia",
    title: TITLE,
    description: DESCRIPTION,
    ...(SITE_URL ? { url: SITE_URL } : {}),
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

/**
 * Página pública do CRM.
 *
 * O middleware manda quem já tem sessão para `/dashboard` e mantém `/` aberta
 * para o visitante — por isso esta rota não consulta o Supabase nem tem estado:
 * é conteúdo estático, com o acesso ao produto como único destino.
 */
export default function Home() {
  return (
    // `landing` delimita o reset de `prefers-reduced-motion`, que não pode
    // alcançar o spinner e o skeleton das telas autenticadas.
    <div className="landing min-h-screen bg-white">
      {/* Sem JS, revela na hora — a animação `reveal-failsafe` de
          `globals.css` cobre o resto (hidratação que falha, chunk que não
          chega), mas só depois do atraso dela. */}
      <noscript>
        <style>{".reveal{opacity:1;transform:none;animation:none}"}</style>
      </noscript>
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Management />
        <Dashboards />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
