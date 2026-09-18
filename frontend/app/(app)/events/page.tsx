"use client";

import { Fragment, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useRange } from "@/lib/range";
import { api, qs } from "@/lib/api";
import { fmtDateTime, timeAgo } from "@/lib/utils";
import { Card } from "@/components/Charts";
import { EmptyState, ErrorState, ChartSkeleton } from "@/components/States";
import type { EventRow } from "@/lib/types";

interface EventsResponse {
  events: EventRow[];
  total: number;
  nextCursor: string | null;
  eventNames: string[];
}

export default function EventsPage() {
  const { currentProject } = useAuth();
  const { params } = useRange();
  const pid = currentProject?.id;

  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters = { name, userId, page, cursor };
  const query = useQuery({
    queryKey: ["events-explorer", pid, params.from, params.to, name, userId, page, cursor],
    queryFn: () =>
      api.get<EventsResponse>(
        `/api/projects/${pid}/analytics/events${qs({ ...params, ...filters, limit: 50 })}`
      ),
    enabled: Boolean(pid),
    placeholderData: keepPreviousData,
  });

  const reset = () => {
    setCursor(null);
  };

  if (!pid) return <EmptyState title="No project selected" />;

  const data = query.data;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-white">Events</h1>

      {/* Filters */}
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <select
          className="input !w-48"
          value={name}
          onChange={(e) => { setName(e.target.value); reset(); }}
        >
          <option value="">All event types</option>
          {data?.eventNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <input
          className="input !w-48"
          placeholder="Filter by user ID"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); reset(); }}
        />
        <input
          className="input !w-48"
          placeholder="Filter by page"
          value={page}
          onChange={(e) => { setPage(e.target.value); reset(); }}
        />
        <div className="flex-1" />
        <span className="text-xs text-subtle">
          {data ? `${data.total.toLocaleString()} matching` : ""}
        </span>
        <a
          className="btn-ghost text-xs"
          href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/projects/${pid}/export/events.csv?${new URLSearchParams({ ...(name ? { name } : {}) }).toString()}`}
          onClick={(e) => {
            e.preventDefault();
            api.download(`/api/projects/${pid}/export/events.csv${qs({ name })}`, `events-${pid}.csv`);
          }}
        >
          Export CSV
        </a>
      </div>

      <Card title="Event stream">
        {query.isLoading ? (
          <ChartSkeleton height={400} />
        ) : query.isError ? (
          <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : !data || data.events.length === 0 ? (
          <EmptyState title="No events found" description="Adjust filters or send events via the API." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr>
                    <th className="th">Event</th>
                    <th className="th">User</th>
                    <th className="th">Session</th>
                    <th className="th">Page</th>
                    <th className="th">Device</th>
                    <th className="th">Source</th>
                    <th className="th">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <Fragment key={e.id}>
                      <tr
                        className="hover:bg-ink-700/40 cursor-pointer"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        <td className="td"><span className="font-mono text-xs text-accent-soft">{e.name}</span></td>
                        <td className="td text-slate-300">{e.userId}</td>
                        <td className="td text-muted text-xs">{e.sessionId.slice(0, 18)}…</td>
                        <td className="td text-muted">{e.page ?? "—"}</td>
                        <td className="td text-muted">{e.device ?? "—"}</td>
                        <td className="td text-muted">{e.source ?? "—"}</td>
                        <td className="td text-muted" title={fmtDateTime(e.timestamp)}>{timeAgo(e.timestamp)}</td>
                      </tr>
                      {expanded === e.id && e.properties && (
                        <tr key={e.id + "-props"}>
                          <td colSpan={7} className="td !py-2 bg-ink-850">
                            <pre className="text-xs text-muted overflow-x-auto">{JSON.stringify(e.properties, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-3">
              <button
                className="btn-ghost text-xs"
                disabled={!cursor}
                onClick={() => setCursor(null)}
              >
                First page
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={!data.nextCursor}
                onClick={() => setCursor(data.nextCursor)}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
