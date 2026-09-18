"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function StatSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-7 w-24" />
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="card p-4">
      <Skeleton className="h-4 w-40 mb-4" />
      <div style={{ height }}>
        <Skeleton className="w-full h-full" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-xl bg-ink-700 grid place-items-center mb-4 text-2xl">∅</div>
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-900 grid place-items-center mb-4 text-red-300">!</div>
      <h3 className="text-sm font-semibold text-slate-200">Something went wrong</h3>
      <p className="mt-1 text-sm text-muted max-w-sm">{message ?? "Failed to load data."}</p>
      {onRetry && (
        <button className="btn-ghost mt-4" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
