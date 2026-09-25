import type { LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";

/**
 * Passo a passo de onde colar a URL, escrito para quem nunca viu a palavra
 * "webhook". Os nomes de menu são os que a ferramenta mostra, em inglês
 * quando ela só existe em inglês.
 */
const STEPS: Record<Exclude<LeadSourceProvider, "meta_lead_ads">, React.ReactNode[]> = {
  typeform: [
    <>Copie a URL acima.</>,
    <>
      No Typeform, abra o formulário e clique em <b>Connect</b>, depois na aba <b>Webhooks</b>.
    </>,
    <>
      Clique em <b>Add a webhook</b>, cole a URL e salve. Confira se a chave do webhook ficou
      ligada (<b>ON</b>).
    </>,
    <>
      Para testar, clique em <b>View deliveries</b> → <b>Send test request</b>, ou responda o próprio
      formulário. O lead aparece aqui em segundos.
    </>,
  ],
  webhook: [
    <>Copie a URL acima.</>,
    <>
      Na ferramenta, procure a opção <b>Webhook</b> (às vezes chamada de &quot;enviar para URL&quot; ou
      &quot;integração HTTP&quot;) e cole a URL. Método <b>POST</b>.
    </>,
    <>
      Não precisa de senha, cabeçalho nem formato especial: JSON e formulário comum funcionam. O
      CRM reconhece nome, e-mail e telefone sozinho.
    </>,
    <>Envie um teste. Os campos que chegarem aparecem em &quot;Campos recebidos&quot; para você conferir.</>,
  ],
};

const TIPS: Record<Exclude<LeadSourceProvider, "meta_lead_ads">, React.ReactNode> = {
  typeform: (
    <>
      Quer saber de qual campanha veio o lead? Crie no Typeform os <i>hidden fields</i>{" "}
      <code>utm_source</code>, <code>utm_medium</code> e <code>utm_campaign</code>: eles chegam no card
      do lead.
    </>
  ),
  webhook: (
    <>
      Onde fica em ferramentas comuns: <b>Elementor</b> → Formulário → Ações após o envio → Webhook ·{" "}
      <b>Make/Zapier/n8n</b> → módulo HTTP (POST) · <b>RD Station</b> → Integrações → Webhooks.
    </>
  ),
};

export function SourceSetupGuide({ provider }: { provider: LeadSourceProvider }) {
  if (provider === "meta_lead_ads") return null;
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {STEPS[provider].map((step, index) => (
          <li key={index} className="flex gap-3 text-sm text-ink-soft">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700"
            >
              {index + 1}
            </span>
            <span className="pt-0.5 leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-ink-soft ring-1 ring-line">
        {TIPS[provider]}
      </p>
      {provider === "webhook" && (
        <details className="text-xs text-ink-soft">
          <summary className="cursor-pointer font-medium text-ink-soft hover:text-primary-700">
            Exemplo para desenvolvedores
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 leading-relaxed ring-1 ring-line">{`POST <URL acima>
Content-Type: application/json

{
  "event_id": "id-unico-do-envio (opcional, evita duplicar)",
  "nome": "Ana Souza",
  "email": "ana@exemplo.com",
  "telefone": "(84) 99999-0000",
  "utm_source": "google",
  "qual_plano": "Empresarial"
}`}</pre>
        </details>
      )}
    </div>
  );
}
