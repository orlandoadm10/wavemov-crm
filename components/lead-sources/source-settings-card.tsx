"use client";

import {
  deleteLeadSourceAction,
  rotateLeadSourceTokenAction,
  updateLeadSourceAction,
  type LeadSourceActionResult,
} from "@/app/(dashboard)/fontes/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { KeyRound, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

type Confirming = "rotate" | "delete" | null;

export function SourceSettingsCard({
  sourceId,
  name: initialName,
  isActive,
  form,
}: {
  sourceId: string;
  name: string;
  isActive: boolean;
  form: { name: string; isActive: boolean };
}) {
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState(initialName);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [feedback, setFeedback] = useState<LeadSourceActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<LeadSourceActionResult>, after?: (r: LeadSourceActionResult) => void) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      if (!result.error) (after ?? (() => router.refresh()))(result);
    });
  }

  return (
    <Card className="h-full">
      <CardHeader title="Configurações" />
      <div className="space-y-5 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateLeadSourceAction(sourceId, { name }));
          }}
        >
          <Label htmlFor={nameId}>Nome da conexão</Label>
          <div className="flex gap-2">
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
            <Button type="submit" variant="outline" disabled={pending || name.trim() === initialName}>
              Salvar
            </Button>
          </div>
        </form>

        <div>
          {/* O rótulo fica DENTRO do Switch: é o <label> dele que dá nome ao controle. */}
          <Switch
            label="Recebendo leads"
            checked={isActive}
            disabled={pending}
            onChange={(value) => run(() => updateLeadSourceAction(sourceId, { isActive: value }))}
          />
          <p className="mt-1 text-xs text-ink-faint">Pausada, a URL recusa as entregas.</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-ink-soft ring-1 ring-line">
          <p>
            Destino: <b className="text-ink">{form.name}</b>
            {!form.isActive && <span className="text-rose-700"> (desativado — as entregas vão falhar)</span>}
          </p>
          <Link href="/formularios" className="mt-1 inline-block font-medium text-primary-600 hover:text-primary-700">
            Editar funil, etapa ou campos em Formulários →
          </Link>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Button variant="outline" onClick={() => setConfirming("rotate")} disabled={pending}>
            <KeyRound className="h-4 w-4" /> Gerar URL nova
          </Button>
          <button
            type="button"
            onClick={() => setConfirming("delete")}
            disabled={pending}
            className={buttonClasses({ variant: "ghost", className: "text-rose-600 hover:bg-rose-50 hover:text-rose-700" })}
          >
            <Trash2 className="h-4 w-4" /> Excluir conexão
          </button>
        </div>

        {feedback && (
          <p
            role={feedback.error ? "alert" : "status"}
            className={
              feedback.error
                ? "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
                : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            }
          >
            {feedback.error ?? feedback.success}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming === "rotate"}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          run(() => rotateLeadSourceTokenAction(sourceId));
        }}
        title="Gerar URL nova?"
        description="A URL atual para de funcionar na hora. Os leads só voltam a entrar depois que você colar a nova na ferramenta de origem."
        confirmLabel="Gerar URL nova"
        danger
        loading={pending}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          setConfirming(null);
          run(() => deleteLeadSourceAction(sourceId), () => router.push("/fontes"));
        }}
        title="Excluir esta conexão?"
        description="A URL deixa de receber leads e o histórico de entregas é apagado. Os leads que ela trouxe e o formulário de destino continuam no CRM."
        confirmLabel="Excluir"
        danger
        loading={pending}
      />
    </Card>
  );
}
