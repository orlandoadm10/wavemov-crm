"use client";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { fullName } from "@/lib/utils";
import { profileSchema } from "@/lib/validations";
import type { Profile } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type FormData = z.input<typeof profileSchema>;

export function ProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const completeness = useMemo(() => {
    const fields = [
      profile.first_name,
      profile.last_name,
      profile.email,
      profile.phone,
      profile.job_title,
      profile.avatar_url,
    ];
    const filled = fields.filter((f) => f && String(f).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [profile]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(profileSchema),
    values: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone ?? "",
      job_title: profile.job_title ?? "",
      avatar_url: profile.avatar_url ?? "",
    },
  });

  async function onSubmit(data: FormData) {
    setMessage(null);
    const parsed = profileSchema.parse(data);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        phone: parsed.phone || null,
        job_title: parsed.job_title || null,
        avatar_url: parsed.avatar_url || null,
      })
      .eq("id", profile.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
      return;
    }
    setMessage({ type: "ok", text: "Perfil atualizado com sucesso!" });
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="flex items-center justify-between p-5">
        <div>
          <h1 className="text-xl font-bold text-ink">
            Perfil <span className="text-sm font-normal text-ink-faint">{fullName(profile)}</span>
          </h1>
        </div>
        <Button variant={editing ? "outline" : "primary"} onClick={() => setEditing((v) => !v)}>
          <Pencil className="h-4 w-4" />
          {editing ? "Cancelar" : "Editar"}
        </Button>
      </Card>

      <Card className="p-6">
        {/* Perfil completo */}
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">Perfil completo</span>
            <span className="text-lg font-bold text-ink">{completeness}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="flex h-full items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white transition-all"
              style={{ width: `${completeness}%` }}
            >
              {completeness >= 25 ? `${completeness}%` : ""}
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="mb-3 text-sm font-semibold text-ink">Foto de perfil</p>
            <div className="flex justify-center">
              <Avatar name={fullName(profile)} src={profile.avatar_url} size="xl" />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primeiro nome" error={errors.first_name?.message}>
              <Input disabled={!editing} {...register("first_name")} />
            </Field>
            <Field label="Sobrenome">
              <Input disabled={!editing} placeholder="Last Name" {...register("last_name")} />
            </Field>
          </div>
          <Field label="Telefone">
            <Input disabled={!editing} placeholder="5511999999999" {...register("phone")} />
          </Field>
          <Field label="E-mail">
            <Input disabled {...register("email")} />
          </Field>
          <Field label="Cargo">
            <Input disabled={!editing} placeholder="Ex.: Dev" {...register("job_title")} />
          </Field>
          <Field label="URL da foto de perfil" error={errors.avatar_url?.message as string}>
            <Input disabled={!editing} placeholder="https://…" {...register("avatar_url")} />
          </Field>

          {message && (
            <p
              className={
                message.type === "ok"
                  ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                  : "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              }
            >
              {message.text}
            </p>
          )}

          {editing && (
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Salvar alterações
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
