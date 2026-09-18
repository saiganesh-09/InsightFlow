import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

/**
 * Statistical anomaly detection.
 *
 * For each monitored metric we compute a baseline (mean + stddev) from a
 * trailing historical window, then compare the most recent observation with a
 * z-score test. Anomalies are only flagged when |z| exceeds the threshold AND
 * the observed volume is material (no noise on tiny counts).
 */

const Z_MEDIUM = 2.5;
const Z_HIGH = 3.5;
const MIN_OBSERVED = 5; // don't flag spikes on trivial counts

interface MetricResult {
  metric: string;
  observed: number;
  mean: number;
  stddev: number;
  sampleSize: number;
  window: string;
  unit: string;
}

function zScore(r: MetricResult) {
  return r.stddev > 0 ? (r.observed - r.mean) / r.stddev : 0;
}

async function hourlySeries(
  projectId: string,
  days: number,
  nameFilter?: string
): Promise<number[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const nameClause = nameFilter ? Prisma.sql`AND name = ${nameFilter}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ bucket: Date; n: bigint }[]>(
    Prisma.sql`SELECT date_trunc('hour', "timestamp") AS bucket, COUNT(*)::int AS n
      FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${since} ${nameClause}
      GROUP BY bucket ORDER BY bucket`
  );
  return rows.map((r) => Number(r.n));
}

async function dailySeries(
  projectId: string,
  days: number,
  nameFilter?: string
): Promise<number[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const nameClause = nameFilter ? Prisma.sql`AND name = ${nameFilter}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ bucket: Date; n: bigint }[]>(
    Prisma.sql`SELECT date_trunc('day', "timestamp") AS bucket, COUNT(*)::int AS n
      FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${since} ${nameClause}
      GROUP BY bucket ORDER BY bucket`
  );
  return rows.map((r) => Number(r.n));
}

async function dailyUniqueUsers(projectId: string, days: number): Promise<number[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.$queryRaw<{ bucket: Date; n: bigint }[]>(
    Prisma.sql`SELECT date_trunc('day', "timestamp") AS bucket,
        COUNT(DISTINCT "userId")::int AS n
      FROM "Event"
      WHERE "projectId" = ${projectId} AND "timestamp" >= ${since}
      GROUP BY bucket ORDER BY bucket`
  );
  return rows.map((r) => Number(r.n));
}

function stats(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

function metricFromSeries(
  metric: string,
  series: number[],
  window: "hourly" | "daily",
  unit: string
): MetricResult | null {
  if (series.length < 4) return null; // not enough history
  const observed = series[series.length - 1];
  const baseline = series.slice(0, -1);
  const { mean, stddev } = stats(baseline);
  return { metric, observed, mean, stddev, sampleSize: baseline.length, window, unit };
}

/** Detect + persist anomalies for a project. Returns newly created rows. */
export async function scanProject(projectId: string) {
  const metrics: (MetricResult | null)[] = [
    metricFromSeries("event_count:ALL", await hourlySeries(projectId, 7), "hourly", "events"),
    metricFromSeries("unique_users", await dailyUniqueUsers(projectId, 14), "daily", "users"),
    metricFromSeries("event_count:PAYMENT_FAILED", await dailySeries(projectId, 14, "PAYMENT_FAILED"), "daily", "events"),
    metricFromSeries("event_count:PURCHASE", await dailySeries(projectId, 14, "PURCHASE"), "daily", "events"),
    metricFromSeries("event_count:PAGE_VIEW", await dailySeries(projectId, 14, "PAGE_VIEW"), "daily", "events"),
  ];

  const created = [];
  for (const m of metrics) {
    if (!m) continue;
    const z = zScore(m);
    const absZ = Math.abs(z);
    const direction = z > 0 ? "spike" : "drop";
    const material =
      direction === "spike" ? m.observed >= Math.max(MIN_OBSERVED, m.mean + 3 * m.stddev) : m.observed <= m.mean - 3 * m.stddev && m.mean >= MIN_OBSERVED;

    if (absZ < Z_MEDIUM || !material) continue;

    const severity = absZ >= Z_HIGH ? "HIGH" : "MEDIUM";

    // Dedup: skip if an anomaly for the same metric was recorded recently
    const recent = await prisma.anomaly.findFirst({
      where: {
        projectId,
        metric: m.metric,
        detectedAt: { gte: new Date(Date.now() - 6 * 3600_000) },
      },
    });
    if (recent) continue;

    const message =
      direction === "spike"
        ? `${m.metric} spiked to ${m.observed} ${m.unit} (${Math.round(z * 10) / 10}σ above baseline mean of ${Math.round(m.mean * 10) / 10})`
        : `${m.metric} dropped to ${m.observed} ${m.unit} (${Math.round(Math.abs(z) * 10) / 10}σ below baseline mean of ${Math.round(m.mean * 10) / 10})`;

    const anomaly = await prisma.anomaly.create({
      data: {
        projectId,
        metric: m.metric,
        severity,
        direction,
        baseline: m.mean,
        observed: m.observed,
        zScore: z,
        message,
        window: m.window,
        metadata: { sampleSize: m.sampleSize, stddev: m.stddev },
      },
    });
    created.push(anomaly);
    logger.info(`Anomaly detected for project ${projectId}: ${message}`);
  }
  return created;
}

/** Scan every project — used by the scheduled worker. */
export async function scanAllProjects() {
  const projects = await prisma.project.findMany({ select: { id: true } });
  let total = 0;
  for (const p of projects) {
    try {
      const created = await scanProject(p.id);
      total += created.length;
    } catch (err) {
      logger.error(`Anomaly scan failed for project ${p.id}: ${(err as Error).message}`);
    }
  }
  return total;
}
