import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { cached } from "../../lib/redis.js";
import { CONVERSION_EVENTS } from "../events/events.schemas.js";
import {
  eventWhere,
  sessionWhere,
  resolveRange,
  type RangeQuery,
  type ResolvedRange,
} from "./filters.js";

const CACHE_TTL = 60; // seconds; invalidated early via project version bump

const CONV_LIST = Prisma.join([...CONVERSION_EVENTS].map((e) => Prisma.sql`${e}`));

// ─────────────────────────── Overview ───────────────────────────

export interface OverviewMetrics {
  events: number;
  users: number;
  sessions: number;
  conversions: number;
  conversionRate: number;
  avgSessionDurationSec: number;
  activeUsers5m: number;
  eventsPerSession: number;
  period: { from: string; to: string };
  previous?: {
    users: number;
    sessions: number;
    events: number;
    conversionRate: number;
  };
}

async function computeOverview(projectId: string, q: RangeQuery, r: ResolvedRange) {
  const ew = eventWhere(projectId, q, r);
  const sw = sessionWhere(projectId, q, r);

  const [ev] = await prisma.$queryRaw<
    [{ events: bigint; users: bigint; sessions: bigint; conversions: bigint }]
  >(
    Prisma.sql`SELECT
        COUNT(*)::int AS events,
        COUNT(DISTINCT "userId")::int AS users,
        COUNT(DISTINCT "sessionId")::int AS sessions,
        COUNT(*) FILTER (WHERE name IN (${CONV_LIST}))::int AS conversions
      FROM "Event" WHERE ${ew}`
  );

  const [sess] = await prisma.$queryRaw<
    [{ avg_duration: number | null; converted: bigint; total: bigint }]
  >(
    Prisma.sql`SELECT
        AVG(EXTRACT(EPOCH FROM ("lastEventAt" - "startedAt"))) AS avg_duration,
        COUNT(*) FILTER (WHERE converted)::int AS converted,
        COUNT(*)::int AS total
      FROM "Session" WHERE ${sw}`
  );

  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  const [act] = await prisma.$queryRaw<[{ n: bigint }]>(
    Prisma.sql`SELECT COUNT(DISTINCT "userId")::int AS n FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${fiveMinAgo}`
  );

  // Previous-period comparison (same length window immediately before)
  const span = r.to.getTime() - r.from.getTime();
  const prev: ResolvedRange = {
    from: new Date(r.from.getTime() - span),
    to: r.from,
  };
  const pew = eventWhere(projectId, q, prev);
  const psw = sessionWhere(projectId, q, prev);
  const [pe] = await prisma.$queryRaw<
    [{ events: bigint; users: bigint; sessions: bigint }]
  >(
    Prisma.sql`SELECT COUNT(*)::int AS events, COUNT(DISTINCT "userId")::int AS users,
        COUNT(DISTINCT "sessionId")::int AS sessions
      FROM "Event" WHERE ${pew}`
  );
  const [ps] = await prisma.$queryRaw<[{ c: bigint; t: bigint }]>(
    Prisma.sql`SELECT COUNT(*) FILTER (WHERE converted)::int AS c, COUNT(*)::int AS t
      FROM "Session" WHERE ${psw}`
  );

  const sessions = Number(ev.sessions);
  const sessTotal = Number(sess.total);
  return {
    events: Number(ev.events),
    users: Number(ev.users),
    sessions,
    conversions: Number(ev.conversions),
    conversionRate: sessTotal > 0 ? Number(sess.converted) / sessTotal : 0,
    avgSessionDurationSec: sess.avg_duration ? Math.round(sess.avg_duration) : 0,
    activeUsers5m: Number(act.n),
    eventsPerSession: sessions > 0 ? Number(ev.events) / sessions : 0,
    period: { from: r.from.toISOString(), to: r.to.toISOString() },
    previous: {
      users: Number(pe.users),
      sessions: Number(pe.sessions),
      events: Number(pe.events),
      conversionRate: Number(ps.t) > 0 ? Number(ps.c) / Number(ps.t) : 0,
    },
  } satisfies OverviewMetrics;
}

export function getOverview(projectId: string, q: RangeQuery): Promise<OverviewMetrics> {
  const r = resolveRange(q);
  const key = `overview:${r.from.toISOString()}:${r.to.toISOString()}:${JSON.stringify(q)}`;
  return cached(projectId, key, CACHE_TTL, () => computeOverview(projectId, q, r));
}

// ─────────────────────────── Timeseries ───────────────────────────

export type Metric = "events" | "users" | "sessions";

export async function getTimeseries(
  projectId: string,
  q: RangeQuery & { metric?: Metric; interval?: "hour" | "day" }
) {
  const r = resolveRange(q);
  const metric: Metric = q.metric ?? "events";
  const interval = q.interval ?? (r.to.getTime() - r.from.getTime() > 48 * 3600_000 ? "day" : "hour");
  const ew = eventWhere(projectId, q, r);

  const valueExpr =
    metric === "users"
      ? Prisma.sql`COUNT(DISTINCT "userId")`
      : metric === "sessions"
        ? Prisma.sql`COUNT(DISTINCT "sessionId")`
        : Prisma.sql`COUNT(*)`;

  const rows = await prisma.$queryRaw<{ bucket: Date; value: bigint }[]>(
    Prisma.sql`SELECT date_trunc(${interval}, "timestamp") AS bucket, ${valueExpr}::int AS value
      FROM "Event" WHERE ${ew}
      GROUP BY bucket ORDER BY bucket ASC`
  );
  return {
    metric,
    interval,
    points: rows.map((x) => ({ t: x.bucket, value: Number(x.value) })),
  };
}

// ─────────────────────────── Leaderboards ───────────────────────────

export async function getTopPages(projectId: string, q: RangeQuery, limit = 10) {
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r);
  const rows = await prisma.$queryRaw<
    { page: string; views: bigint; users: bigint }[]
  >(
    Prisma.sql`SELECT "page", COUNT(*)::int AS views, COUNT(DISTINCT "userId")::int AS users
      FROM "Event" WHERE ${ew} AND name = 'PAGE_VIEW' AND "page" IS NOT NULL
      GROUP BY "page" ORDER BY views DESC LIMIT ${limit}`
  );
  return { pages: rows.map((x) => ({ page: x.page, views: Number(x.views), users: Number(x.users) })) };
}

export async function getTopEvents(projectId: string, q: RangeQuery, limit = 12) {
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r);
  const rows = await prisma.$queryRaw<{ name: string; count: bigint; users: bigint }[]>(
    Prisma.sql`SELECT name, COUNT(*)::int AS count, COUNT(DISTINCT "userId")::int AS users
      FROM "Event" WHERE ${ew}
      GROUP BY name ORDER BY count DESC LIMIT ${limit}`
  );
  return { events: rows.map((x) => ({ name: x.name, count: Number(x.count), users: Number(x.users) })) };
}

export async function getTrafficSources(projectId: string, q: RangeQuery) {
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r);
  const rows = await prisma.$queryRaw<
    { source: string | null; sessions: bigint; users: bigint; events: bigint }[]
  >(
    Prisma.sql`SELECT COALESCE("source", 'direct') AS source,
        COUNT(DISTINCT "sessionId")::int AS sessions,
        COUNT(DISTINCT "userId")::int AS users,
        COUNT(*)::int AS events
      FROM "Event" WHERE ${ew}
      GROUP BY source ORDER BY sessions DESC LIMIT 15`
  );
  return {
    sources: rows.map((x) => ({
      source: x.source,
      sessions: Number(x.sessions),
      users: Number(x.users),
      events: Number(x.events),
    })),
  };
}

const DIMENSIONS = ["device", "browser", "os", "country"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export async function getBreakdown(projectId: string, q: RangeQuery, dimension: Dimension) {
  if (!DIMENSIONS.includes(dimension)) throw new Error("Invalid dimension");
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r);
  const col = Prisma.raw(`"${dimension}"`); // whitelisted identifier
  const rows = await prisma.$queryRaw<
    { value: string | null; users: bigint; events: bigint; sessions: bigint }[]
  >(
    Prisma.sql`SELECT COALESCE(${col}, 'unknown') AS value,
        COUNT(DISTINCT "userId")::int AS users,
        COUNT(*)::int AS events,
        COUNT(DISTINCT "sessionId")::int AS sessions
      FROM "Event" WHERE ${ew}
      GROUP BY value ORDER BY events DESC LIMIT 12`
  );
  return {
    dimension,
    values: rows.map((x) => ({
      value: x.value,
      users: Number(x.users),
      events: Number(x.events),
      sessions: Number(x.sessions),
    })),
  };
}

// ─────────────────────────── Realtime ───────────────────────────

export async function getRealtimeSummary(projectId: string) {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  const hourAgo = new Date(Date.now() - 3600_000);

  const [active] = await prisma.$queryRaw<[{ n: bigint }]>(
    Prisma.sql`SELECT COUNT(DISTINCT "userId")::int AS n FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${fiveMinAgo}`
  );
  const [hour] = await prisma.$queryRaw<[{ n: bigint }]>(
    Prisma.sql`SELECT COUNT(*)::int AS n FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${hourAgo}`
  );
  const pages = await prisma.$queryRaw<{ page: string | null; n: bigint }[]>(
    Prisma.sql`SELECT "page", COUNT(*)::int AS n FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${fiveMinAgo} AND "page" IS NOT NULL
      GROUP BY "page" ORDER BY n DESC LIMIT 8`
  );
  const recent = await prisma.event.findMany({
    where: { projectId },
    orderBy: { receivedAt: "desc" },
    take: 25,
    select: {
      id: true, name: true, userId: true, sessionId: true, page: true,
      device: true, browser: true, country: true, source: true, timestamp: true,
    },
  });
  return {
    activeUsers: Number(active.n),
    eventsLastHour: Number(hour.n),
    activePages: pages.map((p) => ({ page: p.page, count: Number(p.n) })),
    recentEvents: recent,
  };
}

// ─────────────────────────── Segmentation / users ───────────────────────────

export async function getUserSegments(projectId: string, q: RangeQuery) {
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r, "e");

  // New users = users whose FIRST-EVER event falls inside the range
  const [agg] = await prisma.$queryRaw<
    [{ users: bigint; new_users: bigint; sessions: bigint; events: bigint; conv_users: bigint }]
  >(
    Prisma.sql`SELECT
        COUNT(DISTINCT e."userId")::int AS users,
        COUNT(DISTINCT e."userId") FILTER (WHERE firsts.first_ts >= ${r.from})::int AS new_users,
        COUNT(DISTINCT e."sessionId")::int AS sessions,
        COUNT(*)::int AS events,
        COUNT(DISTINCT e."userId") FILTER (WHERE e.name IN (${CONV_LIST}))::int AS conv_users
      FROM "Event" e
      JOIN (
        SELECT "userId", MIN("timestamp") AS first_ts
        FROM "Event" WHERE "projectId" = ${projectId}
        GROUP BY "userId"
      ) firsts ON firsts."userId" = e."userId"
      WHERE ${ew}`
  );

  const users = Number(agg.users);
  return {
    users,
    newUsers: Number(agg.new_users),
    returningUsers: users - Number(agg.new_users),
    sessions: Number(agg.sessions),
    events: Number(agg.events),
    conversionRate: users > 0 ? Number(agg.conv_users) / users : 0,
    eventsPerUser: users > 0 ? Number(agg.events) / users : 0,
  };
}

export async function getTopUsers(projectId: string, q: RangeQuery, limit = 25) {
  const r = resolveRange(q);
  const ew = eventWhere(projectId, q, r);
  const rows = await prisma.$queryRaw<
    { userId: string; events: bigint; sessions: bigint; last_seen: Date; converted: bigint }[]
  >(
    Prisma.sql`SELECT "userId",
        COUNT(*)::int AS events,
        COUNT(DISTINCT "sessionId")::int AS sessions,
        MAX("timestamp") AS last_seen,
        COUNT(*) FILTER (WHERE name IN (${CONV_LIST}))::int AS converted
      FROM "Event" WHERE ${ew}
      GROUP BY "userId" ORDER BY events DESC LIMIT ${limit}`
  );
  return {
    users: rows.map((x) => ({
      userId: x.userId,
      events: Number(x.events),
      sessions: Number(x.sessions),
      lastSeen: x.last_seen,
      conversions: Number(x.converted),
    })),
  };
}

export async function getSessions(projectId: string, q: RangeQuery, page = 1, pageSize = 20) {
  const r = resolveRange(q);
  const sw = sessionWhere(projectId, q, r);
  const where = Prisma.sql`${sw}`;

  const [countRow] = await prisma.$queryRaw<[{ n: bigint }]>(
    Prisma.sql`SELECT COUNT(*)::int AS n FROM "Session" WHERE ${where}`
  );
  const rows = await prisma.$queryRaw<
    {
      sessionId: string; userId: string; startedAt: Date; lastEventAt: Date;
      eventCount: number; converted: boolean; device: string | null;
      browser: string | null; country: string | null; source: string | null;
      duration_sec: number | null;
    }[]
  >(
    Prisma.sql`SELECT "sessionId", "userId", "startedAt", "lastEventAt", "eventCount",
        converted, device, browser, country, source,
        EXTRACT(EPOCH FROM ("lastEventAt" - "startedAt")) AS duration_sec
      FROM "Session" WHERE ${where}
      ORDER BY "lastEventAt" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
  );
  return {
    total: Number(countRow.n),
    page,
    pageSize,
    sessions: rows.map((s) => ({
      ...s,
      durationSec: s.duration_sec ? Math.round(s.duration_sec) : 0,
      duration_sec: undefined,
    })),
  };
}
