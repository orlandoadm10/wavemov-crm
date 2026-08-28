"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError, normalizePhone } from "@/lib/utils";
import { contactSchema } from "@/lib/validations";
import type { Contact } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type FormData = z.input<typeof contactSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** `null` cria um contato novo; um contato edita o existente. */
  contact?: Contact | null;
}

/**
 * Formulário único de criação e edição de contato, usado na listagem de
 * contatos e no detalhe da negociação.
 */
export function ContactModal({ open, onClose, organizationId, contact = null }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? "Editar contato" : "Novo contato"}
      subtitle={contact ? "As alterações valem para todas as negociações deste contato." : undefined}
      size="lg"
    >
      {/* O Modal desmonta o conteúdo ao fechar: o formulário sempre monta
          com os dados atuais, sem estado remanescente da edição anterior. */}
      <ContactForm
        organizationId={organizationId}
        contact={contact}
        onClose={onClose}
      />
    </Modal>
  );
}

function ContactForm({
  organizationId,
  contact,
  onClose,
}: {
  organizationId: string;
  contact: Contact | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      whatsapp_phone: contact?.whatsapp_phone ?? "",
      document: contact?.document ?? "",
      city: contact?.city ?? "",
      state: contact?.state ?? "",
      notes: contact?.notes ?? "",
    },
  });

  // O webhook do WhatsApp encontra o contato pelo número exato. Trocar o
  // número em um contato que já tem um vale um aviso explícito.
  const currentWhatsApp = watch("whatsapp_phone") ?? "";
  const whatsAppChanged =
    !!contact?.whatsapp_phone &&
    normalizePhone(currentWhatsApp) !== contact.whatsapp_phone;

  async function onSubmit(data: FormData) {
    setError(null);
    const parsed = contactSchema.parse(data);
    const payload = {
      name: parsed.name,
      email: parsed.email || null,
      phone: parsed.phone || null,
      whatsapp_phone: parsed.whatsapp_phone ? normalizePhone(parsed.whatsapp_phone) : null,
      document: parsed.document || null,
      city: parsed.city || null,
      state: parsed.state || null,
      notes: parsed.notes || null,
    };

    // Toda escrita filtra a organização mesmo com RLS ativo, e só é sucesso
    // quando o PostgREST devolve a linha afetada.
    const { data: rows, error: writeError } = contact
      ? await supabase
          .from("contacts")
          .update(payload)
          .eq("id", contact.id)
          .eq("organization_id", organizationId)
          .select("id")
      : await supabase
          .from("contacts")
          .insert({ ...payload, organization_id: organizationId })
          .select("id");

    if (writeError) {
      setError(
        describeWriteError(
          writeError,
          contact ? "Não foi possível salvar o contato." : "Não foi possível criar o contato."
        )
      );
      return;
    }
    if ((rows ?? []).length === 0) {
      setError(
        contact
          ? "O contato não foi atualizado. Ele pode ter sido removido ou você não tem permissão. Atualize a página."
          : "O contato não foi criado. Verifique suas permissões e tente novamente."
      );
      return;
    }

    onClose();
    // Os dados exibidos vêm do servidor; sem revalidar, a tela continua
    // mostrando o contato antigo.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name?.message}>
          <Input placeholder="Nome completo" {...register("name")} />
        </Field>
        <Field label="E-mail" error={errors.email?.message as string}>
          <Input type="email" placeholder="email@exemplo.com" {...register("email")} />
        </Field>
        <Field label="Telefone">
          <Input placeholder="+55 11 99999-9999" {...register("phone")} />
        </Field>
        <Field label="WhatsApp">
          <Input placeholder="5511999999999" {...register("whatsapp_phone")} />
        </Field>
        <Field label="CPF/CNPJ">
          <Input {...register("document")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade">
            <Input {...register("city")} />
          </Field>
          <Field label="UF">
            <Input maxLength={2} placeholder="SP" {...register("state")} />
          </Field>
        </div>
      </div>
      <Field label="Observações">
        <Textarea {...register("notes")} />
      </Field>

      {whatsAppChanged && (
        <p
            role="status"
            className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            As conversas atuais continuam vinculadas, mas mensagens do número antigo passam a
            abrir um contato novo. Confirme o número antes de salvar.
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {contact ? "Salvar contato" : "Criar contato"}
        </Button>
      </div>
    </form>
  );
}
