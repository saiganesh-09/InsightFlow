"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { subscribeProject } from "@/lib/socket";
import { fmtNumber, timeAgo } from "@/lib/utils";
import { Card } from "@/components/Charts";
import { EmptyState, ErrorState, ChartSkeleton } from "@/components/States";
import type { LiveEvent, RealtimeSummary } from "@/lib/types";

const MAX_FEED = 60;

export default function RealtimePage() {
  const { currentProject } = useAuth();
  const pid = currentProject?.id;
  const [feed, setFeed] = useState<LiveEvent[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const minuteBuckets = useRef<Map<number, number>>(new Map());
  const [tick, setTick] = useState(0);

  // Initial snapshot (REST)
  const summary = useQuery({
    queryKey: ["realtime", pid],
    queryFn: () => api.get<RealtimeSummary>(`/api/projects/${pid}/analytics/realtime`),
    enabled: Boolean(pid),
    refetchInterval: 30_000,
  });

  // Socket subscription
  useEffect(() => {
    if (!pid) return;
    setConnected(true);
    const unsub = subscribeProject(pid, (evt) => {
      setFeed((f) => [evt, ...f].slice(0, MAX_FEED));
      setLiveCount((c) => c + 1);
      const bucket = Math.floor(Date.now() / 60_000);
      minuteBuckets.current.set(bucket, (minuteBuckets.current.get(bucket) ?? 0) + 1);
      setTick((t) => t + 1);
    });
    return () => {
      unsub();
      setConnected(false);
    };
  }, [pid]);

  // Merge initial REST feed once
  useEffect(() => {
    if (summary.data?.recentEvents) {
      setFeed((f) => {
        if (f.length > 0) return f;
        return summary.data.recentEvents.map((e) => ({
          projectId: pid!,
          id: e.id,
          name: e.name,
          userId: e.userId,
          sessionId: e.sessionId,
          page: e.page,
          device: e.device,
          browser: e.browser,
          country: e.country,
          source: e.source,
          timestamp: e.timestamp,
          properties: e.properties,
        }));
      });
    }
  }, [summary.data, pid]);

  const perMinute = useMemo(() => {
    void tick;
    const now = Math.floor(Date.now() / 60_000);
    return Array.from({ length: 15 }, (_, i) => {
      const b = now - (14 - i);
      return {
        label: new Date(b * 60_000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        value: minuteBuckets.current.get(b) ?? 0,
      };
    });
  }, [tick]);

  // force re-render every 10s for "x ago" freshness
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!pid) return <EmptyState title="No project selected" />;

  const active = summary.data?.activeUsers ?? 0;
  const lastHour = (summary.data?.eventsLastHour ?? 0) + liveCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          Realtime
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 live-dot" : "bg-subtle"}`} />
        </h1>
        <span className="text-xs text-subtle">{connected ? "live" : "connecting…"}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Active users</div>
          <div className="mt-2 text-3xl font-bold text-emerald-300 tabular-nums">{fmtNumber(active)}</div>
          <div className="text-xs text-subtle mt-1">last 5 minutes</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wider text-muted">Events last hour</div>
          <div className="mt-2 text-3xl font-bold text-white tabular-nums">{fmtNumber(lastHour)}</div>
        </div>
        <div className="card p-4 col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Events / min (live)</div>
          <div className="flex items-end gap-1 h-10">
            {perMinute.map((b, i) => (
              <div
                key={i}
                className="flex-1 bg-accent/70 rounded-sm"
                style={{ height: `${Math.max(6, Math.min(100, b.value * 20))}%` }}
                title={`${b.label}: ${b.value}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card title="Live activity" subtitle="events arrive via WebSocket — no refresh needed">
            {summary.isLoading ? (
              <ChartSkeleton height={400} />
            ) : feed.length === 0 ? (
              <EmptyState
                title="Waiting for events"
                description="Open the demo generator (http://localhost:4000/demo) or send events with your API key."
              />
            ) : (
              <div className="divide-y divide-ink-700/60 max-h-[520px] overflow-y-auto -mx-4 px-4">
                {feed.map((e) => (
                  <div key={e.id} className="py-2.5 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="text-slate-200 font-medium">{e.userId}</span>{" "}
                        <span className="text-accent-soft font-mono text-xs">{e.name}</span>
                      </div>
                      <div className="text-xs text-subtle truncate">
                        {e.page ?? "—"} · {e.device ?? "?"} · {e.source ?? "direct"}
                      </div>
                    </div>
                    <span className="text-xs text-subtle shrink-0">{timeAgo(e.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Active pages" subtitle="last 5 minutes">
            {summary.isError ? (
              <ErrorState onRetry={() => summary.refetch()} />
            ) : summary.data && summary.data.activePages.length > 0 ? (
              <div className="space-y-2">
                {summary.data.activePages.map((p) => (
                  <div key={p.page} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-200">{p.page}</span>
                    <span className="text-muted tabular-nums">{p.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No active pages" />
            )}
          </Card>
          <Card title="Events per minute">
            <div className="space-y-1.5">
              {perMinute.slice(-8).map((b) => (
                <div key={b.label} className="flex items-center justify-between text-sm">
                  <span className="text-subtle text-xs">{b.label}</span>
                  <span className="tabular-nums text-slate-200">{b.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
