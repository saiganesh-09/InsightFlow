"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { fmtDate, fmtNumber, fmtPct } from "@/lib/utils";
import { Card, AreaTrend } from "@/components/Charts";
import { ConfirmModal } from "@/components/Modal";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/States";
import type { Report } from "@/lib/types";

function StatusBadge({ status }: { status: Report["status"] }) {
  const styles: Record<string, string> = {
    COMPLETED: "bg-emerald-950/60 text-emerald-300",
    GENERATING: "bg-sky-950/60 text-sky-300",
    PENDING: "bg-ink-600 text-muted",
    FAILED: "bg-red-950/60 text-red-300",
  };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${styles[status]}`}>{status}</span>;
}

export default function ReportsPage() {
  const { currentProject } = useAuth();
  const pid = currentProject?.id;
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reports = useQuery({
    queryKey: ["reports", pid],
    queryFn: () => api.get<{ reports: Report[] }>(`/api/projects/${pid}/reports`),
    enabled: Boolean(pid),
    refetchInterval: (q) =>
      q.state.data?.reports.some((r) => r.status === "PENDING" || r.status === "GENERATING")
        ? 3000
        : false,
  });

  const detail = useQuery({
    queryKey: ["report", openId],
    queryFn: () => api.get<{ report: Report }>(`/api/projects/${pid}/reports/${openId}`),
    enabled: Boolean(pid && openId),
    refetchInterval: (q) =>
      q.state.data?.report.status === "PENDING" || q.state.data?.report.status === "GENERATING"
        ? 2000
        : false,
  });

  const generate = useMutation({
    mutationFn: (type: "WEEKLY" | "MONTHLY") =>
      api.post(`/api/projects/${pid}/reports`, { type }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["reports", pid] });
      const rep = (res as { report: Report }).report;
      setOpenId(rep.id);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${pid}/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports", pid] });
      setDeleteId(null);
      setOpenId(null);
    },
  });

  if (!pid) return <EmptyState title="No project selected" />;

  const rep = detail.data?.report;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-white">Reports</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={generate.isPending} onClick={() => generate.mutate("WEEKLY")}>
            {generate.isPending ? "Queuing…" : "Generate weekly report"}
          </button>
          <button className="btn-primary" disabled={generate.isPending} onClick={() => generate.mutate("MONTHLY")}>
            {generate.isPending ? "Queuing…" : "Generate monthly report"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* List */}
        <Card title="Generated reports">
          {reports.isLoading ? (
            <ChartSkeleton height={300} />
          ) : reports.isError ? (
            <ErrorState onRetry={() => reports.refetch()} />
          ) : reports.data && reports.data.reports.length > 0 ? (
            <div className="space-y-2">
              {reports.data.reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    openId === r.id ? "bg-ink-700 border-accent" : "bg-ink-850 border-ink-600 hover:bg-ink-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">{r.type} report</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-subtle mt-1">
                    {fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)} · created {fmtDate(r.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No reports yet" description="Generate a weekly or monthly report to see AI-powered summaries." />
          )}
        </Card>

        {/* Detail */}
        <div className="lg:col-span-2">
          <Card
            title={rep ? `${rep.type} report` : "Report detail"}
            action={
              rep && rep.status === "COMPLETED" ? (
                <div className="flex gap-2">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => api.download(`/api/projects/${pid}/reports/${rep.id}/download`, `report-${rep.id}.md`)}
                  >
                    Download .md
                  </button>
                  <button className="btn-danger text-xs" onClick={() => setDeleteId(rep.id)}>Delete</button>
                </div>
              ) : undefined
            }
          >
            {!openId ? (
              <EmptyState title="Select a report" description="Choose a report from the list or generate a new one." />
            ) : detail.isLoading || rep?.status === "PENDING" || rep?.status === "GENERATING" ? (
              <div className="py-10 text-center">
                <div className="skeleton h-4 w-2/3 mx-auto mb-3" />
                <div className="skeleton h-4 w-1/2 mx-auto" />
                <p className="text-sm text-muted mt-4">
                  {rep?.status === "GENERATING" ? "Generating report…" : "Queued — waiting for worker…"}
                </p>
              </div>
            ) : rep?.status === "FAILED" ? (
              <ErrorState message={rep.error ?? "Report generation failed"} onRetry={() => detail.refetch()} />
            ) : rep ? (
              <div className="space-y-4">
                {rep.data && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ["Events", fmtNumber(rep.data.totals.events)],
                        ["Users", fmtNumber(rep.data.totals.users)],
                        ["Sessions", fmtNumber(rep.data.totals.sessions)],
                        ["Conversion", fmtPct(rep.data.totals.conversionRate)],
                      ].map(([l, v]) => (
                        <div key={l} className="bg-ink-850 rounded-lg p-3">
                          <div className="text-[11px] uppercase tracking-wider text-subtle">{l}</div>
                          <div className="text-lg font-bold text-white tabular-nums">{v}</div>
                        </div>
                      ))}
                    </div>
                    {rep.data.dailyEvents?.length > 0 && (
                      <div>
                        <div className="text-xs text-subtle mb-1">Daily events</div>
                        <AreaTrend data={rep.data.dailyEvents} height={160} />
                      </div>
                    )}
                    {rep.data.anomalies?.length > 0 && (
                      <div>
                        <div className="text-xs text-subtle mb-1">Anomalies in period</div>
                        <ul className="text-sm text-muted space-y-1">
                          {rep.data.anomalies.map((a, i) => (
                            <li key={i}>• [{a.severity}] {a.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wider text-subtle mb-2">AI Summary</div>
                  <div className="prose-sm text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {rep.summary ?? "No summary."}
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && del.mutate(deleteId)}
        title="Delete report"
        body="This permanently deletes the report."
        loading={del.isPending}
      />
    </div>
  );
}
