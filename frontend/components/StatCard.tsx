import { cn, fmtDelta } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  deltaInverse,
  hint,
}: {
  label: string;
  value: string;
  delta?: { curr: number; prev: number | undefined };
  deltaInverse?: boolean;
  hint?: string;
}) {
  const d = delta ? fmtDelta(delta.curr, delta.prev) : null;
  const good = deltaInverse ? !(d?.positive ?? true) : (d?.positive ?? true);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        {d && d.positive !== null && (
          <span
            className={cn(
              "text-xs font-semibold px-1.5 py-0.5 rounded",
              good ? "text-emerald-300 bg-emerald-950/50" : "text-red-300 bg-red-950/50"
            )}
            title="vs previous period"
          >
            {d.text}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-bold text-white tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </div>
  );
}
