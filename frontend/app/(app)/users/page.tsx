"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useRange } from "@/lib/range";
import { api, qs } from "@/lib/api";
import { fmtDateTime, fmtDuration, fmtNumber, fmtPct, timeAgo } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { Card, Donut } from "@/components/Charts";
import { ChartSkeleton, EmptyState, ErrorState, StatSkeleton } from "@/components/States";
import type { BreakdownValue, SegmentStats, SessionRow, TopUser } from "@/lib/types";

const COUNTRIES = ["", "US", "DE", "GB", "IN", "BR", "FR", "CA"];
const DEVICES = ["", "desktop", "mobile", "tablet"];
const SOURCES = ["", "direct", "google", "facebook", "twitter", "bing", "newsletter", "github"];

export default function UsersPage() {
  const { currentProject } = useAuth();
  const { params } = useRange();
  const pid = currentProject?.id;

  const [country, setCountry] = useState("");
  const [device, setDevice] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"users" | "sessions">("users");

  const filterParams = { ...params, country, device, source };

  const segments = useQuery({
    queryKey: ["segments", pid, JSON.stringify(filterParams)],
    queryFn: () => api.get<SegmentStats>(`/api/projects/${pid}/analytics/segments${qs(filterParams)}`),
    enabled: Boolean(pid),
  });
  const topUsers = useQuery({
    queryKey: ["top-users", pid, JSON.stringify(filterParams)],
    queryFn: () => api.get<{ users: TopUser[] }>(`/api/projects/${pid}/analytics/users${qs(filterParams)}`),
    enabled: Boolean(pid) && tab === "users",
  });
  const sessions = useQuery({
    queryKey: ["sessions", pid, JSON.stringify(filterParams), page],
    queryFn: () =>
      api.get<{ total: number; sessions: SessionRow[] }>(
        `/api/projects/${pid}/analytics/sessions${qs({ ...filterParams, page, pageSize: 15 })}`
      ),
    enabled: Boolean(pid) && tab === "sessions",
  });
  const countries = useQuery({
    queryKey: ["countries", pid, JSON.stringify(filterParams)],
    queryFn: () =>
      api.get<{ values: BreakdownValue[] }>(`/api/projects/${pid}/analytics/breakdown/country${qs(filterParams)}`),
    enabled: Boolean(pid),
  });

  if (!pid) return <EmptyState title="No project selected" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-white">Users &amp; Segments</h1>
        <div className="flex gap-2">
          <select className="input !w-36" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c || "All countries"}</option>)}
          </select>
          <select className="input !w-36" value={device} onChange={(e) => setDevice(e.target.value)}>
            {DEVICES.map((d) => <option key={d} value={d}>{d || "All devices"}</option>)}
          </select>
          <select className="input !w-36" value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => <option key={s} value={s}>{s || "All sources"}</option>)}
          </select>
        </div>
      </div>

      {segments.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : segments.isError ? (
        <ErrorState onRetry={() => segments.refetch()} />
      ) : segments.data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Users" value={fmtNumber(segments.data.users)} />
          <StatCard label="New users" value={fmtNumber(segments.data.newUsers)} hint="first seen in range" />
          <StatCard label="Returning" value={fmtNumber(segments.data.returningUsers)} />
          <StatCard label="Sessions" value={fmtNumber(segments.data.sessions)} />
          <StatCard label="Events / user" value={segments.data.eventsPerUser.toFixed(1)} />
          <StatCard label="Conversion" value={fmtPct(segments.data.conversionRate)} />
        </div>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card
            title={tab === "users" ? "Most active users" : "Sessions"}
            action={
              <div className="flex gap-1 bg-ink-700 rounded-lg p-0.5">
                {(["users", "sessions"] as const).map((t) => (
                  <button
                    key={t}
                    className={`px-3 py-1 text-xs rounded-md ${tab === t ? "bg-ink-600 text-white" : "text-muted"}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "users" ? "Users" : "Sessions"}
                  </button>
                ))}
              </div>
            }
          >
            {tab === "users" ? (
              topUsers.isLoading ? <ChartSkeleton height={320} /> : topUsers.isError ? (
                <ErrorState onRetry={() => topUsers.refetch()} />
              ) : topUsers.data && topUsers.data.users.length > 0 ? (
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr><th className="th">User</th><th className="th">Events</th><th className="th">Sessions</th><th className="th">Conv.</th><th className="th">Last seen</th></tr>
                    </thead>
                    <tbody>
                      {topUsers.data.users.map((u) => (
                        <tr key={u.userId}>
                          <td className="td font-medium">{u.userId}</td>
                          <td className="td tabular-nums">{fmtNumber(u.events)}</td>
                          <td className="td tabular-nums">{u.sessions}</td>
                          <td className="td tabular-nums">{u.conversions}</td>
                          <td className="td text-muted" title={fmtDateTime(u.lastSeen)}>{timeAgo(u.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="No users in this segment" />
            ) : sessions.isLoading ? <ChartSkeleton height={320} /> : sessions.isError ? (
              <ErrorState onRetry={() => sessions.refetch()} />
            ) : sessions.data && sessions.data.sessions.length > 0 ? (
              <>
                <div className="overflow-x-auto -mx-4">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr>
                        <th className="th">Session</th><th className="th">User</th><th className="th">Duration</th>
                        <th className="th">Events</th><th className="th">Device</th><th className="th">Source</th><th className="th">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.data.sessions.map((s) => (
                        <tr key={s.sessionId}>
                          <td className="td text-xs text-muted font-mono">{s.sessionId.slice(0, 16)}…</td>
                          <td className="td">{s.userId}</td>
                          <td className="td tabular-nums">{fmtDuration(s.durationSec)}</td>
                          <td className="td tabular-nums">{s.eventCount}</td>
                          <td className="td text-muted">{s.device ?? "—"}</td>
                          <td className="td text-muted">{s.source ?? "—"}</td>
                          <td className="td">{s.converted ? <span className="text-emerald-300">✓</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between items-center pt-3 text-xs text-subtle">
                  <span>Page {page} · {sessions.data.total.toLocaleString()} sessions</span>
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                    <button className="btn-ghost text-xs" disabled={page * 15 >= sessions.data.total} onClick={() => setPage(page + 1)}>Next →</button>
                  </div>
                </div>
              </>
            ) : <EmptyState title="No sessions" />}
          </Card>
        </div>
        <Card title="Users by country">
          {countries.isLoading ? <ChartSkeleton height={300} /> : countries.data && countries.data.values.length > 0 ? (
            <Donut data={countries.data.values.map((v) => ({ name: v.value, value: v.users }))} height={300} />
          ) : <EmptyState title="No data" />}
        </Card>
      </div>
    </div>
  );
}
