import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-panel",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  sublabel,
  value,
  hint,
  icon,
  tone = "blue",
  className,
}: {
  label: string;
  sublabel?: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "blue" | "green" | "red" | "amber" | "slate";
  className?: string;
}) {
  const dots: Record<string, string> = {
    blue: "bg-primary",
    green: "bg-success",
    red: "bg-destructive",
    amber: "bg-warning",
    slate: "bg-muted-foreground",
  };
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          {sublabel && <p className="text-xs text-ink-faint">{sublabel}</p>}
        </div>
        {icon ?? <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", dots[tone])} />}
      </div>
      <p className="font-display mt-3 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {hint && <div className="mt-2 text-xs text-ink-faint">{hint}</div>}
    </Card>
  );
}
