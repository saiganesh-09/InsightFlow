"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useRange } from "@/lib/range";
import { api, qs } from "@/lib/api";
import { fmtNumber, fmtPct, fmtDuration } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { AreaTrend, BarSeries, Donut, Card } from "@/components/Charts";
import { ChartSkeleton, EmptyState, ErrorState, StatSkeleton } from "@/components/States";
import type {
  BreakdownValue,
  OverviewMetrics,
  TimeseriesPoint,
  TopEvent,
  TopPage,
  TrafficSource,
} from "@/lib/types";

export default function OverviewPage() {
  const { currentProject } = useAuth();
  const { params } = useRange();
  const pid = currentProject?.id;

  const enabled = Boolean(pid);

  const overview = useQuery({
    queryKey: ["overview", pid, params.from, params.to],
    queryFn: () => api.get<OverviewMetrics>(`/api/projects/${pid}/analytics/overview${qs(params)}`),
    enabled,
  });
  const usersSeries = useQuery({
    queryKey: ["ts-users", pid, params.from, params.to],
    queryFn: () =>
      api.get<{ metric: string; interval: string; points: TimeseriesPoint[] }>(
        `/api/projects/${pid}/analytics/timeseries${qs({ ...params, metric: "users" })}`
      ),
    enabled,
  });
  const eventsSeries = useQuery({
    queryKey: ["ts-events", pid, params.from, params.to],
    queryFn: () =>
      api.get<{ metric: string; interval: string; points: TimeseriesPoint[] }>(
        `/api/projects/${pid}/analytics/timeseries${qs({ ...params, metric: "events" })}`
      ),
    enabled,
  });
  const sources = useQuery({
    queryKey: ["sources", pid, params.from, params.to],
    queryFn: () =>
      api.get<{ sources: TrafficSource[] }>(`/api/projects/${pid}/analytics/traffic-sources${qs(params)}`),
    enabled,
  });
  const topPages = useQuery({
    queryKey: ["top-pages", pid, params.from, params.to],
    queryFn: () => api.get<{ pages: TopPage[] }>(`/api/projects/${pid}/analytics/top-pages${qs(params)}`),
    enabled,
  });
  const topEvents = useQuery({
    queryKey: ["top-events", pid, params.from, params.to],
    queryFn: () => api.get<{ events: TopEvent[] }>(`/api/projects/${pid}/analytics/top-events${qs(params)}`),
    enabled,
  });
  const devices = useQuery({
    queryKey: ["devices", pid, params.from, params.to],
    queryFn: () =>
      api.get<{ values: BreakdownValue[] }>(`/api/projects/${pid}/analytics/breakdown/device${qs(params)}`),
    enabled,
  });
  const browsers = useQuery({
    queryKey: ["browsers", pid, params.from, params.to],
    queryFn: () =>
      api.get<{ values: BreakdownValue[] }>(`/api/projects/${pid}/analytics/breakdown/browser${qs(params)}`),
    enabled,
  });

  if (!pid) {
    return (
      <EmptyState
        title="No project selected"
        description="Create a project from the selector in the top bar to start collecting analytics."
      />
    );
  }

  const ov = overview.data;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-white">Overview</h1>
        <span className="text-xs text-subtle">{currentProject?.name}</span>
      </div>

      {/* Stat cards */}
      {overview.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : overview.isError ? (
        <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
      ) : ov ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Users" value={fmtNumber(ov.users)} delta={{ curr: ov.users, prev: ov.previous?.users }} />
          <StatCard label="Active now" value={fmtNumber(ov.activeUsers5m)} hint="last 5 minutes" />
          <StatCard label="Sessions" value={fmtNumber(ov.sessions)} delta={{ curr: ov.sessions, prev: ov.previous?.sessions }} />
          <StatCard label="Events" value={fmtNumber(ov.events)} delta={{ curr: ov.events, prev: ov.previous?.events }} />
          <StatCard
            label="Conversion"
            value={fmtPct(ov.conversionRate)}
            delta={{ curr: ov.conversionRate, prev: ov.previous?.conversionRate }}
          />
          <StatCard label="Avg session" value={fmtDuration(ov.avgSessionDurationSec)} />
        </div>
      ) : null}

      {/* Timeseries row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Users over time" subtitle="unique users per bucket">
          {usersSeries.isLoading ? <ChartSkeleton height={240} /> : usersSeries.isError ? (
            <ErrorState onRetry={() => usersSeries.refetch()} />
          ) : usersSeries.data && usersSeries.data.points.length > 0 ? (
            <AreaTrend data={usersSeries.data.points} interval={usersSeries.data.interval} height={240} name="Users" />
          ) : (
            <EmptyState title="No data" description="Send events to populate this chart." />
          )}
        </Card>
        <Card title="Events over time" subtitle="total events per bucket">
          {eventsSeries.isLoading ? <ChartSkeleton height={240} /> : eventsSeries.isError ? (
            <ErrorState onRetry={() => eventsSeries.refetch()} />
          ) : eventsSeries.data && eventsSeries.data.points.length > 0 ? (
            <AreaTrend data={eventsSeries.data.points} interval={eventsSeries.data.interval} height={240} color="#6ee7a0" name="Events" />
          ) : (
            <EmptyState title="No data" />
          )}
        </Card>
      </div>

      {/* Breakdowns row */}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card title="Traffic sources">
          {sources.isLoading ? <ChartSkeleton height={220} /> : sources.data && sources.data.sources.length > 0 ? (
            <Donut data={sources.data.sources.map((s) => ({ name: s.source ?? "direct", value: s.sessions }))} height={220} />
          ) : <EmptyState title="No data" />}
        </Card>
        <Card title="Devices">
          {devices.isLoading ? <ChartSkeleton height={220} /> : devices.data && devices.data.values.length > 0 ? (
            <Donut data={devices.data.values.map((v) => ({ name: v.value, value: v.users }))} height={220} />
          ) : <EmptyState title="No data" />}
        </Card>
        <Card title="Top pages" subtitle="by page views">
          {topPages.isLoading ? <ChartSkeleton height={220} /> : topPages.data && topPages.data.pages.length > 0 ? (
            <BarSeries horizontal height={220} data={topPages.data.pages.slice(0, 7).map((p) => ({ label: p.page, value: p.views }))} />
          ) : <EmptyState title="No page views" />}
        </Card>
        <Card title="Top events">
          {topEvents.isLoading ? <ChartSkeleton height={220} /> : topEvents.data && topEvents.data.events.length > 0 ? (
            <BarSeries horizontal height={220} data={topEvents.data.events.slice(0, 7).map((e) => ({ label: e.name, value: e.count }))} />
          ) : <EmptyState title="No events" />}
        </Card>
      </div>

      {/* Tables row */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Browsers">
          {browsers.isLoading ? <ChartSkeleton height={180} /> : browsers.data ? (
            <table className="w-full">
              <thead><tr><th className="th">Browser</th><th className="th">Users</th><th className="th">Events</th></tr></thead>
              <tbody>
                {browsers.data.values.map((v) => (
                  <tr key={v.value}>
                    <td className="td font-medium">{v.value}</td>
                    <td className="td tabular-nums">{fmtNumber(v.users)}</td>
                    <td className="td tabular-nums">{fmtNumber(v.events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
        <Card title="Sessions by source">
          {sources.isLoading ? <ChartSkeleton height={180} /> : sources.data ? (
            <table className="w-full">
              <thead><tr><th className="th">Source</th><th className="th">Sessions</th><th className="th">Users</th></tr></thead>
              <tbody>
                {sources.data.sources.slice(0, 8).map((s) => (
                  <tr key={s.source}>
                    <td className="td font-medium">{s.source}</td>
                    <td className="td tabular-nums">{fmtNumber(s.sessions)}</td>
                    <td className="td tabular-nums">{fmtNumber(s.users)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
