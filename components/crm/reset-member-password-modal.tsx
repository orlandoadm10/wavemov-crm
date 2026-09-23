"use client";

import { resetMemberPasswordAction } from "@/app/(dashboard)/pessoas/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PASSWORD_MIN } from "@/lib/features/account-security/domain/password-policy";
import { useActionState } from "react";

/**
 * O administrador define uma senha nova para alguém da equipe — o caminho que
 * funciona mesmo sem envio de e-mail configurado. As guardas (mesma empresa,
 * sem acesso a outra empresa, não é admin global) moram no servidor.
 *
 * Quem abre passa `key` com a pessoa: o estado do formulário recomeça a cada
 * pessoa aberta.
 */
export function ResetMemberPasswordModal({
  member,
  onClose,
}: {
  member: { profileId: string; name: string } | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(resetMemberPasswordAction, null);

  return (
    <Modal
      open={Boolean(member)}
      onClose={onClose}
      title="Redefinir senha"
      subtitle={member ? `Nova senha para ${member.name}` : undefined}
      size="sm"
    >
      {state?.success ? (
        <div className="space-y-4">
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="profile_id" value={member?.profileId ?? ""} />
          <Field label="Senha nova">
            <Input name="new_password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          </Field>
          <Field label="Confirme a senha nova">
            <Input name="confirmation" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
          </Field>
          <p className="text-xs text-ink-faint">
            A pessoa passa a entrar com esta senha na hora. Ela pode trocá-la depois em Meu perfil.
          </p>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Redefinir senha
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
