import { cn, formatDateTime, fullName } from "@/lib/utils";
import type { ActivityLog } from "@/types";

export function DealActivityTimeline({ activities }: { activities: ActivityLog[] }) {
  if (activities.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-faint">
        Nenhuma atividade operacional registrada.
      </p>
    );
  }

  return (
    <ol className="px-5 py-4">
      {activities.map((activity, index) => (
        <li key={activity.id} className="relative flex gap-3.5 pb-5 last:pb-1">
          {index < activities.length - 1 && (
            <span className="absolute top-5 left-[7px] h-full w-px bg-line" />
          )}
          <span
            className={cn(
              "relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ring-2",
              activity.type === "deal_won"
                ? "bg-emerald-500 ring-emerald-200"
                : activity.type === "deal_lost"
                  ? "bg-rose-500 ring-rose-200"
                  : activity.type === "note"
                    ? "bg-amber-400 ring-amber-200"
                    : "bg-primary-500 ring-primary-200"
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{activity.title}</p>
            {activity.description && (
              <p className="mt-0.5 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap text-ink-soft">
                {activity.description}
              </p>
            )}
            <p className="mt-0.5 text-xs text-ink-faint">
              {activity.actor ? `${fullName(activity.actor)} · ` : ""}
              {formatDateTime(activity.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
