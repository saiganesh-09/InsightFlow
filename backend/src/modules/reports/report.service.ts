import type { Report } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { aiConfigured, chat } from "../ai/llm.js";
import * as analytics from "../analytics/analytics.service.js";

export interface ReportData {
  period: { from: string; to: string };
  totals: {
    events: number;
    users: number;
    sessions: number;
    conversions: number;
    conversionRate: number;
    avgSessionDurationSec: number;
  };
  previousTotals: { users: number; sessions: number; events: number; conversionRate: number };
  growth: { usersPct: number | null; sessionsPct: number | null; eventsPct: number | null };
  topPages: { page: string; views: number; users: number }[];
  topEvents: { name: string; count: number; users: number }[];
  trafficSources: { source: string | null; sessions: number; users: number }[];
  dailyEvents: { t: Date; value: number }[];
  anomalies: { severity: string; message: string; detectedAt: Date }[];
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

export async function buildReportData(
  projectId: string,
  from: Date,
  to: Date
): Promise<ReportData> {
  const q = { from, to };
  const [ov, topPages, topEvents, sources, daily, anomalies] = await Promise.all([
    analytics.getOverview(projectId, q),
    analytics.getTopPages(projectId, q, 10),
    analytics.getTopEvents(projectId, q, 10),
    analytics.getTrafficSources(projectId, q),
    analytics.getTimeseries(projectId, { ...q, metric: "events", interval: "day" }),
    prisma.anomaly.findMany({
      where: { projectId, detectedAt: { gte: from, lte: to } },
      orderBy: { detectedAt: "desc" },
      take: 20,
    }),
  ]);

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      events: ov.events,
      users: ov.users,
      sessions: ov.sessions,
      conversions: ov.conversions,
      conversionRate: ov.conversionRate,
      avgSessionDurationSec: ov.avgSessionDurationSec,
    },
    previousTotals: ov.previous ?? { users: 0, sessions: 0, events: 0, conversionRate: 0 },
    growth: {
      usersPct: pct(ov.users, ov.previous?.users ?? 0),
      sessionsPct: pct(ov.sessions, ov.previous?.sessions ?? 0),
      eventsPct: pct(ov.events, ov.previous?.events ?? 0),
    },
    topPages: topPages.pages,
    topEvents: topEvents.events,
    trafficSources: sources.sources,
    dailyEvents: daily.points,
    anomalies: anomalies.map((a) => ({
      severity: a.severity,
      message: a.message,
      detectedAt: a.detectedAt,
    })),
  };
}

const REPORT_SYSTEM_PROMPT = `You write executive analytics summaries for InsightFlow reports.
Given structured metrics for a period, produce a concise markdown report with:
1. A 2-3 sentence headline summary.
2. "Key trends" — 3-5 bullets with concrete numbers and % changes.
3. "Anomalies & risks" — bullets referencing the detected anomalies (or state none were detected).
4. "Recommended investigations" — 3-5 actionable bullets.
Use only the numbers given. Never fabricate metrics. Keep it under 350 words.`;

function fallbackSummary(data: ReportData, type: string): string {
  const g = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
  return [
    `## ${type} Analytics Summary`,
    ``,
    `The project recorded **${data.totals.events} events** from **${data.totals.users} unique users** across **${data.totals.sessions} sessions**.`,
    `Conversion rate was **${(data.totals.conversionRate * 100).toFixed(1)}%** with an average session duration of **${data.totals.avgSessionDurationSec}s**.`,
    ``,
    `### Key trends`,
    `- Users: ${g(data.growth.usersPct)} vs previous period`,
    `- Sessions: ${g(data.growth.sessionsPct)} vs previous period`,
    `- Events: ${g(data.growth.eventsPct)} vs previous period`,
    ``,
    `### Anomalies & risks`,
    ...(data.anomalies.length
      ? data.anomalies.slice(0, 5).map((a) => `- [${a.severity}] ${a.message}`)
      : ["- No statistically significant anomalies detected this period."]),
    ``,
    `### Top content`,
    ...data.topPages.slice(0, 5).map((p) => `- ${p.page}: ${p.views} views`),
    ``,
    `_Generated without AI (OPENAI_API_KEY not configured). Set it to enable narrative summaries._`,
  ].join("\n");
}

/** Full report generation — invoked by the BullMQ worker (or inline fallback). */
export async function generateReport(reportId: string): Promise<Report> {
  const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  await prisma.report.update({ where: { id: reportId }, data: { status: "GENERATING" } });

  try {
    const data = await buildReportData(report.projectId, report.periodStart, report.periodEnd);

    let summary: string;
    if (aiConfigured()) {
      summary = await chat(
        REPORT_SYSTEM_PROMPT,
        `REPORT TYPE: ${report.type}\nMETRICS (JSON):\n${JSON.stringify(data, null, 2)}`
      );
    } else {
      summary = fallbackSummary(data, report.type);
    }

    return await prisma.report.update({
      where: { id: reportId },
      data: { status: "COMPLETED", data: data as object, summary },
    });
  } catch (err) {
    logger.error(`Report ${reportId} generation failed: ${(err as Error).message}`);
    return prisma.report.update({
      where: { id: reportId },
      data: { status: "FAILED", error: (err as Error).message },
    });
  }
}

export function reportToMarkdown(report: Report): string {
  const data = (report.data ?? {}) as Partial<ReportData>;
  const t = data.totals;
  return [
    `# InsightFlow ${report.type} Report`,
    `Period: ${report.periodStart.toISOString().slice(0, 10)} → ${report.periodEnd.toISOString().slice(0, 10)}`,
    `Generated: ${report.createdAt.toISOString()}`,
    ``,
    t
      ? `| Metric | Value |\n|---|---|\n| Events | ${t.events} |\n| Users | ${t.users} |\n| Sessions | ${t.sessions} |\n| Conversions | ${t.conversions} |\n| Conversion rate | ${(100 * (t.conversionRate ?? 0)).toFixed(1)}% |\n| Avg session | ${t.avgSessionDurationSec}s |`
      : "",
    ``,
    report.summary ?? "_No summary generated._",
  ].join("\n");
}
