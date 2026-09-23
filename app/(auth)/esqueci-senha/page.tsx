"use client";

import { requestPasswordResetAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);
  const invalidLink = useSearchParams().get("link") === "invalido";

  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-white p-8 shadow-(--shadow-card)">
      <h1 className="text-xl font-bold text-ink">Esqueci minha senha</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Informe o e-mail da sua conta. Enviaremos um link para você criar uma senha nova.
      </p>

      {invalidLink && !state?.sent && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          O link expirou ou já foi usado. Peça um novo abaixo — e abra-o no mesmo navegador.
        </p>
      )}

      {state?.sent ? (
        <div className="mt-6 space-y-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <p className="font-semibold">Pedido recebido.</p>
          <p>
            Se houver uma conta com este e-mail, o link chega em alguns minutos. Confira também a
            caixa de spam. Se não chegar, peça ao administrador da sua empresa para redefinir a
            senha em Pessoas.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <Field label="E-mail">
            <Input name="email" type="email" placeholder="voce@empresa.com" autoComplete="email" required />
          </Field>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" loading={pending}>
            Enviar link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-ink-faint">
        <Link href="/login" className="font-semibold text-primary-600 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
