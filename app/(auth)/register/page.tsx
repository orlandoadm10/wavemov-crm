"use client";

import { registerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import Link from "next/link";
import { useActionState } from "react";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-white p-8 shadow-(--shadow-card)">
      <h1 className="text-xl font-bold text-ink">Criar conta</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Sua empresa, funil e etapas padrão serão criados automaticamente.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <Input name="first_name" placeholder="Maria" required />
          </Field>
          <Field label="Sobrenome">
            <Input name="last_name" placeholder="Silva" required />
          </Field>
        </div>
        <Field label="Nome da empresa">
          <Input name="organization_name" placeholder="Minha Corretora" required />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" placeholder="voce@empresa.com" required />
        </Field>
        <Field label="Senha">
          <Input
            name="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            required
          />
        </Field>

        {state?.error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Criar conta
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-faint">
        Já tem conta?{" "}
        <Link href="/login" className="font-semibold text-primary-600 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
