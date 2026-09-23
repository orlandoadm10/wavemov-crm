"use client";

import { setNewPasswordAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "@/lib/features/account-security/domain/password-policy";
import { useActionState } from "react";

// Chega-se aqui pelo link do e-mail (`/auth/confirmar`), que já criou a sessão
// de recuperação. Sem sessão, o middleware manda para o login.
export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(setNewPasswordAction, null);

  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-white p-8 shadow-(--shadow-card)">
      <h1 className="text-xl font-bold text-ink">Criar senha nova</h1>
      <p className="mt-1 text-sm text-ink-faint">Mínimo de {PASSWORD_MIN} caracteres.</p>

      <form action={formAction} className="mt-6 space-y-4">
        <Field label="Senha nova">
          <Input name="new_password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </Field>
        <Field label="Confirme a senha nova">
          <Input name="confirmation" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        </Field>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          Salvar senha
        </Button>
      </form>
    </div>
  );
}
