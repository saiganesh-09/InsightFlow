"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/utils";
import { Card } from "@/components/Charts";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/States";
import type { Anomaly, Insight } from "@/lib/types";

const SUGGESTIONS = [
  "Summarize this month's activity",
  "Why did traffic change this week?",
  "What were the top performing pages?",
  "What unusual changes happened recently?",
  "Which traffic sources bring the most users?",
];

export default function InsightsPage() {
  const { currentProject } = useAuth();
  const pid = currentProject?.id;
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");

  const insights = useQuery({
    queryKey: ["insights", pid],
    queryFn: () => api.get<{ insights: Insight[]; aiConfigured: boolean }>(`/api/projects/${pid}/insights`),
    enabled: Boolean(pid),
  });
  const anomalies = useQuery({
    queryKey: ["anomalies", pid],
    queryFn: () => api.get<{ anomalies: Anomaly[] }>(`/api/projects/${pid}/anomalies`),
    enabled: Boolean(pid),
  });

  const ask = useMutation({
    mutationFn: (q: string) =>
      api.post<{ insight: Insight }>(`/api/projects/${pid}/insights/ask`, { question: q }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["insights", pid] });
      setQuestion("");
    },
  });

  const aiOn = insights.data?.aiConfigured ?? false;

  if (!pid) return <EmptyState title="No project selected" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">AI Insights</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${aiOn ? "bg-emerald-950/60 text-emerald-300" : "bg-amber-950/60 text-amber-300"}`}>
          {aiOn ? "AI configured" : "AI not configured"}
        </span>
      </div>

      {!aiOn && (
        <div className="card p-4 border-amber-900/50 bg-amber-950/20 text-sm text-amber-200">
          Set <code className="font-mono text-xs">OPENAI_API_KEY</code> in <code className="font-mono text-xs">backend/.env</code> to
          enable natural-language analytics questions. Statistical anomaly detection below works without AI.
        </div>
      )}

      {/* Ask */}
      <Card title="Ask about your analytics">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask.mutate(question.trim());
          }}
        >
          <input
            className="input flex-1"
            placeholder={aiOn ? "e.g. Why did signups drop last week?" : "AI is not configured"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!aiOn || ask.isPending}
          />
          <button className="btn-primary" disabled={!aiOn || !question.trim() || ask.isPending}>
            {ask.isPending ? "Analyzing…" : "Ask"}
          </button>
        </form>
        {aiOn && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="text-xs bg-ink-700 hover:bg-ink-600 rounded-md px-2.5 py-1 text-muted"
                onClick={() => setQuestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {ask.isPending && (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        )}
        {ask.isError && (
          <div className="mt-3 text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
            {(ask.error as Error).message}
          </div>
        )}
      </Card>

      {/* Anomalies */}
      <Card title="Detected anomalies" subtitle="statistical z-score detection vs historical baseline">
        {anomalies.isLoading ? (
          <ChartSkeleton height={160} />
        ) : anomalies.isError ? (
          <ErrorState onRetry={() => anomalies.refetch()} />
        ) : anomalies.data && anomalies.data.anomalies.length > 0 ? (
          <div className="space-y-2">
            {anomalies.data.anomalies.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-ink-850 border border-ink-600"
              >
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded mt-0.5 ${
                    a.severity === "HIGH"
                      ? "bg-red-950 text-red-300"
                      : a.severity === "MEDIUM"
                        ? "bg-amber-950 text-amber-300"
                        : "bg-ink-600 text-muted"
                  }`}
                >
                  {a.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200">{a.message}</div>
                  <div className="text-xs text-subtle mt-1">
                    {a.window} · z={a.zScore.toFixed(1)} · detected {fmtDateTime(a.detectedAt)}
                  </div>
                </div>
                <span className={`text-xs ${a.direction === "spike" ? "text-amber-300" : "text-sky-300"}`}>
                  {a.direction === "spike" ? "▲ spike" : "▼ drop"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No anomalies detected" description="The scheduled worker scans metrics every 30 minutes." />
        )}
      </Card>

      {/* History */}
      <Card title="Previous questions">
        {insights.isLoading ? (
          <ChartSkeleton height={200} />
        ) : insights.data && insights.data.insights.length > 0 ? (
          <div className="space-y-3">
            {insights.data.insights.map((i) => (
              <details key={i.id} className="group rounded-lg bg-ink-850 border border-ink-600">
                <summary className="cursor-pointer p-3 text-sm font-medium text-slate-200 list-none flex justify-between">
                  <span>{i.question}</span>
                  <span className="text-xs text-subtle">{fmtDateTime(i.createdAt)}</span>
                </summary>
                <div className="px-3 pb-3 text-sm text-muted whitespace-pre-wrap">{i.answer}</div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="No questions asked yet" />
        )}
      </Card>
    </div>
  );
}
