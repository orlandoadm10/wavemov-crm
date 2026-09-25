import { CardsSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

// Skeleton global das telas autenticadas (Next.js Suspense boundary)
export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <CardsSkeleton />
      <div className="rounded-2xl border border-line bg-card shadow-panel">
        <TableSkeleton rows={7} />
      </div>
    </div>
  );
}
