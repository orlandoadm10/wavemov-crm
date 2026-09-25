import { createAdminClient } from "@/lib/supabase/admin";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { Form, FormField } from "@/types";
import { notFound } from "next/navigation";
import { PublicForm } from "./public-form";

export const dynamic = "force-dynamic";

// Página pública de captura — acessada sem login.
// Usa service role no servidor apenas para LER o formulário ativo.
export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: formRaw } = await admin
    .from("forms")
    .select("id, name, slug, description, is_active, fields:form_fields(*)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!formRaw) notFound();
  const form = formRaw as unknown as Pick<Form, "id" | "name" | "slug" | "description" | "is_active"> & {
    fields: FormField[];
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2 text-ink-faint">
          <BrandLogo size={32} />
          <span className="text-sm font-semibold">CRM JID Mídia</span>
        </div>

        <div className="animate-fade-up rounded-2xl border border-line bg-card p-8 shadow-(--shadow-card)">
          <h1 className="text-xl font-bold text-ink">{form.name}</h1>
          {form.description && (
            <p className="mt-1 text-sm text-ink-faint">{form.description}</p>
          )}
          <PublicForm
            slug={form.slug}
            fields={[...form.fields].sort((a, b) => a.order_index - b.order_index)}
          />
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Seus dados estão protegidos e serão usados apenas para contato.
        </p>
      </div>
    </div>
  );
}
