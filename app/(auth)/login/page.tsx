"use client";

import { loginAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import Link from "next/link";
import { useActionState } from "react";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-card p-8 shadow-(--shadow-card)">
      <h1 className="text-xl font-bold text-ink">Entrar</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Acesse sua conta para gerenciar suas negociações.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <Field label="E-mail">
          <Input
            name="email"
            type="email"
            placeholder="voce@empresa.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Senha">
          <Input
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/esqueci-senha" className="text-xs font-medium text-primary-600 hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
            {state.error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-faint">
        Ainda não tem conta?{" "}
        <Link href="/register" className="font-semibold text-primary-600 hover:underline">
          Criar conta grátis
        </Link>
      </p>
    </div>
  );
}
