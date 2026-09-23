"use client";

import { changePasswordAction } from "@/app/(dashboard)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PASSWORD_MIN } from "@/lib/features/account-security/domain/password-policy";
import { useActionState, useEffect, useRef } from "react";

/** Troca da própria senha, pedindo a atual. */
export function ChangePasswordCard() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Senha trocada: os campos não podem continuar com as senhas digitadas.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader title="Senha" subtitle="Troque a senha de acesso ao CRM" />
      <form ref={formRef} action={formAction} className="space-y-4 p-5">
        <Field label="Senha atual">
          <Input name="current_password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Senha nova">
            <Input name="new_password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          </Field>
          <Field label="Confirme a senha nova">
            <Input name="confirmation" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          </Field>
        </div>
        <p className="text-xs text-ink-faint">Mínimo de {PASSWORD_MIN} caracteres.</p>
        {state?.error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}
