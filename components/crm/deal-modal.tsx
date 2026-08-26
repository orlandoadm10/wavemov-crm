"use client";


import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError, fullName } from "@/lib/utils";
import { dealSchema } from "@/lib/validations";
import type { Contact, Deal, Pipeline, Profile } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type FormData = z.input<typeof dealSchema>;

export function DealModal({
  open,
  onClose,
  organizationId,
  pipelines,
  members,
  contacts,
  deal,
  defaultPipelineId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  pipelines: Pipeline[];
  members: Profile[];
  contacts: Contact[];
  deal?: Deal | null;
  defaultPipelineId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(dealSchema),
    values: deal
      ? {
          title: deal.title,
          value: deal.value,
          pipeline_id: deal.pipeline_id,
          stage_id: deal.stage_id,
          contact_id: deal.contact_id ?? "",
          responsible_id: deal.responsible_id ?? "",
          source: deal.source ?? "",
          temperature: deal.temperature,
          expected_close_date: deal.expected_close_date ?? "",
          utm_source: deal.utm_source ?? "",
          utm_medium: deal.utm_medium ?? "",
          utm_campaign: deal.utm_campaign ?? "",
        }
      : {
          title: "",
          value: 0,
          pipeline_id: defaultPipelineId ?? pipelines[0]?.id ?? "",
          stage_id: "",
          contact_id: "",
          responsible_id: "",
          source: "",
          temperature: "cold",
          expected_close_date: "",
          utm_source: "",
          utm_medium: "",
          utm_campaign: "",
        },
  });

  const selectedPipeline = pipelines.find((p) => p.id === watch("pipeline_id"));
  const stages = (selectedPipeline?.stages ?? []).filter(
    (s) => !s.is_won_stage && !s.is_lost_stage
  );

  function firstOpenStageId(pipelineId: string) {
    const target = pipelines.find((p) => p.id === pipelineId);
    const open = (target?.stages ?? [])
      .filter((s) => !s.is_won_stage && !s.is_lost_stage)
      .sort((a, b) => a.order_index - b.order_index);
    return open[0]?.id ?? "";
  }

  async function onSubmit(data: FormData) {
    setError(null);
    const parsed = dealSchema.parse(data);
    const payload = {
      title: parsed.title,
      value: parsed.value,
      pipeline_id: parsed.pipeline_id,
      stage_id: parsed.stage_id || stages[0]?.id,
      contact_id: parsed.contact_id || null,
      responsible_id: parsed.responsible_id || null,
      source: parsed.source || null,
      temperature: parsed.temperature,
      expected_close_date: parsed.expected_close_date || null,
      utm_source: parsed.utm_source || null,
      utm_medium: parsed.utm_medium || null,
      utm_campaign: parsed.utm_campaign || null,
    };

    if (deal) {
      const { error: err } = await supabase.from("deals").update(payload).eq("id", deal.id);
      if (err) return setError(describeWriteError(err, "Não foi possível salvar a negociação."));
    } else {
      const { data: created, error: err } = await supabase
        .from("deals")
        .insert({ ...payload, organization_id: organizationId })
        .select("id")
        .single();
      if (err) return setError(describeWriteError(err, "Não foi possível criar a negociação."));

      await supabase.from("activity_logs").insert({
        organization_id: organizationId,
        deal_id: created.id,
        type: "deal_created",
        title: "Negociação criada",
      });
    }

    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deal ? "Editar negociação" : "Nova negociação"}
      subtitle={deal ? deal.title : "Crie um novo lead no funil"}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título" error={errors.title?.message}>
            <Input placeholder="Nome do lead ou negócio" {...register("title")} />
          </Field>
          <Field label="Valor (R$)" error={errors.value?.message as string}>
            <Input type="number" step="0.01" min="0" {...register("value")} />
          </Field>
          <Field label="Funil" error={errors.pipeline_id?.message}>
            {/* Trocar o funil precisa reposicionar a etapa: sem isso o stage_id do
                funil anterior era gravado junto com o pipeline_id novo e o card
                sumia dos dois Kanbans (o de origem filtra por funil, o de destino
                não tem coluna com aquele id). Cai na primeira etapa aberta do
                funil escolhido — `stage_id` é uuid obrigatório no dealSchema, então
                deixar vazio travaria o salvamento em vez de resolver. */}
            <Select
              {...register("pipeline_id", {
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  setValue("stage_id", firstOpenStageId(e.target.value), {
                    shouldValidate: true,
                  }),
              })}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa" error={errors.stage_id?.message}>
            <Select {...register("stage_id")}>
              <option value="">Primeira etapa</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contato">
            <Select {...register("contact_id")}>
              <option value="">Sem contato vinculado</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select {...register("responsible_id")}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {fullName(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Origem">
            <Input placeholder="Ex.: WhatsApp Direto, Indicação" {...register("source")} />
          </Field>
          <Field label="Temperatura">
            <Select {...register("temperature")}>
              <option value="cold">Frio</option>
              <option value="warm">Morno</option>
              <option value="hot">Quente 🔥</option>
            </Select>
          </Field>
          <Field label="Previsão de fechamento">
            <Input type="date" {...register("expected_close_date")} />
          </Field>
        </div>

        <details className="rounded-xl border border-line bg-slate-50/60 p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">
            Parâmetros UTM (opcional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="utm_source">
              <Input placeholder="meta" {...register("utm_source")} />
            </Field>
            <Field label="utm_medium">
              <Input placeholder="cpc" {...register("utm_medium")} />
            </Field>
            <Field label="utm_campaign">
              <Input placeholder="campanha-01" {...register("utm_campaign")} />
            </Field>
          </div>
        </details>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {deal ? "Salvar alterações" : "Criar negociação"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
