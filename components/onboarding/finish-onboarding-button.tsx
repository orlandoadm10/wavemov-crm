"use client";

import { finishOnboardingAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { useActionState } from "react";

export function FinishOnboardingButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(finishOnboardingAction, null);
  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <Button type="submit" size="lg" loading={pending}>
        {label}
      </Button>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
