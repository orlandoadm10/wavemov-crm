"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { fullName } from "@/lib/utils";
import { taskSchema } from "@/lib/validations";
import type { Contact, Deal, Profile, Task } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type FormData = z.input<typeof taskSchema>;

export function TaskModal({
  open,
  onClose,
  organizationId,
  profileId,
  members,
  deals,
  contacts,
  task,
  defaultDealId,
  defaultContactId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  profileId: string;
  members: Profile[];
  deals?: Deal[];
  contacts?: Contact[];
  task?: Task | null;
  defaultDealId?: string;
  defaultContactId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(taskSchema),
    values: task
      ? {
          title: task.title,
          description: task.description ?? "",
          due_at: task.due_at ? task.due_at.slice(0, 16) : "",
          priority: task.priority,
          deal_id: task.deal_id ?? "",
          contact_id: task.contact_id ?? "",
          assigned_to: task.assigned_to ?? "",
        }
      : {
          title: "",
          description: "",
          due_at: "",
          priority: "medium",
          deal_id: defaultDealId ?? "",
          contact_id: defaultContactId ?? "",
          assigned_to: profileId,
        },
  });

  async function onSubmit(data: FormData) {
    setError(null);
    const parsed = taskSchema.parse(data);
    const payload = {
      title: parsed.title,
      description: parsed.description || null,
      due_at: parsed.due_at ? new Date(parsed.due_at).toISOString() : null,
      priority: parsed.priority,
      deal_id: parsed.deal_id || null,
      contact_id: parsed.contact_id || null,
      assigned_to: parsed.assigned_to || null,
    };

    if (task) {
      const { error: err } = await supabase.from("tasks").update(payload).eq("id", task.id);
      if (err) return setError(err.message);
    } else {
      const { error: err } = await supabase.from("tasks").insert({
        ...payload,
        organization_id: organizationId,
        created_by: profileId,
      });
      if (err) return setError(err.message);

      if (payload.deal_id) {
        await supabase.from("activity_logs").insert({
          organization_id: organizationId,
          actor_id: profileId,
          deal_id: payload.deal_id,
          type: "task_created",
          title: `Tarefa criada: ${payload.title}`,
        });
      }
    }

    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Editar tarefa" : "Nova tarefa"}
      size="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Título" error={errors.title?.message}>
          <Input placeholder="Ex.: Ligar para o cliente" {...register("title")} />
        </Field>
        <Field label="Descrição">
          <Textarea placeholder="Detalhes da tarefa (opcional)" {...register("description")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data e hora">
            <Input type="datetime-local" {...register("due_at")} />
          </Field>
          <Field label="Prioridade">
            <Select {...register("priority")}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </Field>
        </div>
        <Field label="Responsável">
          <Select {...register("assigned_to")}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)}
              </option>
            ))}
          </Select>
        </Field>
        {deals && deals.length > 0 && (
          <Field label="Negociação vinculada">
            <Select {...register("deal_id")}>
              <option value="">Nenhuma</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {contacts && contacts.length > 0 && (
          <Field label="Contato vinculado">
            <Select {...register("contact_id")}>
              <option value="">Nenhum</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {task ? "Salvar" : "Criar tarefa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
