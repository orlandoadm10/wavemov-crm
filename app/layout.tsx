import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Tipografia do design Jidianos (DESIGN_GUIDE.md, seção 2): Plus Jakarta Sans
// na interface, Space Grotesk em títulos e números de destaque.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  // Base das URLs absolutas de canonical e Open Graph.
  //
  // Sem fallback de propósito: `/` é prerenderizada, então a URL é assada no
  // build. Um deploy sem `NEXT_PUBLIC_APP_URL` publicaria
  // `<link rel="canonical" href="http://localhost:3000">` — que pede ao Google
  // para desindexar a URL real. Não emitir canonical é o mal menor.
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
  // Aponta para o mesmo `public/jid.png` que o `BrandLogo` usa. A convenção
  // `app/icon.png` do Next exigiria uma segunda cópia do arquivo no repo.
  icons: { icon: "/jid.png" },
  title: {
    default: "CRM JID Mídia",
    template: "%s · CRM JID Mídia",
  },
  description:
    "CRM multiempresa com funil de vendas, tarefas, formulários e atendimento WhatsApp.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${grotesk.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
