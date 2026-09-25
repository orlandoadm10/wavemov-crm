"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { FormField } from "@/types";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

export function PublicForm({ slug, fields }: { slug: string; fields: FormField[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch(`/api/forms/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: values }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Erro ao enviar. Tente novamente.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-8 flex flex-col items-center py-6 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success-text">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h2 className="text-lg font-bold text-ink">Recebido com sucesso! 🎉</h2>
        <p className="mt-1 text-sm text-ink-faint">
          Em breve nossa equipe entrará em contato com você.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {fields.map((f) => (
        <Field key={f.id} label={`${f.label}${f.is_required ? " *" : ""}`}>
          {f.field_type === "textarea" ? (
            <Textarea
              required={f.is_required}
              value={values[f.field_key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.field_key]: e.target.value }))}
            />
          ) : f.field_type === "select" ? (
            <Select
              required={f.is_required}
              value={values[f.field_key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.field_key]: e.target.value }))}
            >
              <option value="">Selecione…</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type={
                f.field_type === "email"
                  ? "email"
                  : f.field_type === "number"
                    ? "number"
                    : f.field_type === "phone"
                      ? "tel"
                      : "text"
              }
              required={f.is_required}
              value={values[f.field_key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.field_key]: e.target.value }))}
            />
          )}
        </Field>
      ))}

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{error}</p>
      )}

      <Button type="submit" className="w-full" size="lg" loading={submitting}>
        Enviar
      </Button>
    </form>
  );
}
