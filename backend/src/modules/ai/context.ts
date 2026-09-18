import { prisma } from "../../lib/prisma.js";
import * as analytics from "../analytics/analytics.service.js";

/**
 * Build a structured, aggregated analytics context for the LLM.
 *
 * Privacy note: only aggregated statistics are included — never raw event
 * payloads, never user-level identifiers beyond anonymized counts. The
 * projectId is always resolved through the access-control middleware before
 * this is called, so the AI can never see another tenant's data.
 */
export async function buildProjectContext(projectId: string): Promise<string> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const prev7 = new Date(d7.getTime() - 7 * 86400_000);

  const [project, ov7, ov30, topPages, topEvents, sources, devices, anomalies, daily] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, websiteUrl: true } }),
      analytics.getOverview(projectId, { from: d7, to: now }),
      analytics.getOverview(projectId, { from: d30, to: now }),
      analytics.getTopPages(projectId, { from: d30, to: now }, 8),
      analytics.getTopEvents(projectId, { from: d30, to: now }, 10),
      analytics.getTrafficSources(projectId, { from: d30, to: now }),
      analytics.getBreakdown(projectId, { from: d30, to: now }, "device"),
      prisma.anomaly.findMany({
        where: { projectId, detectedAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
        orderBy: { detectedAt: "desc" },
        take: 10,
      }),
      analytics.getTimeseries(projectId, { from: d30, to: now, metric: "events", interval: "day" }),
    ]);

  const fmt = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2));

  const lines: string[] = [
    `PROJECT: ${project?.name ?? "unknown"}${project?.websiteUrl ? ` (${project.websiteUrl})` : ""}`,
    `CONTEXT GENERATED: ${now.toISOString()}`,
    "",
    "== LAST 7 DAYS ==",
    `Events: ${ov7.events} | Unique users: ${ov7.users} | Sessions: ${ov7.sessions}`,
    `Conversions: ${ov7.conversions} | Conversion rate: ${(ov7.conversionRate * 100).toFixed(1)}% | Avg session: ${ov7.avgSessionDurationSec}s`,
    `Previous week comparison — users: ${ov7.previous?.users ?? 0}, sessions: ${ov7.previous?.sessions ?? 0}, events: ${ov7.previous?.events ?? 0}, conv. rate: ${(((ov7.previous?.conversionRate ?? 0) * 100).toFixed(1))}%`,
    "",
    "== LAST 30 DAYS ==",
    `Events: ${ov30.events} | Unique users: ${ov30.users} | Sessions: ${ov30.sessions}`,
    `Conversion rate: ${(ov30.conversionRate * 100).toFixed(1)}%`,
    "",
    "== TOP PAGES (30d, by PAGE_VIEW) ==",
    ...topPages.pages.map((p) => `  ${p.page}: ${p.views} views, ${p.users} users`),
    "",
    "== TOP EVENTS (30d) ==",
    ...topEvents.events.map((e) => `  ${e.name}: ${e.count} (${e.users} users)`),
    "",
    "== TRAFFIC SOURCES (30d) ==",
    ...sources.sources.map((s) => `  ${s.source}: ${s.sessions} sessions, ${s.users} users`),
    "",
    "== DEVICES (30d) ==",
    ...devices.values.map((d) => `  ${d.value}: ${d.users} users, ${d.events} events`),
    "",
    "== DAILY EVENT COUNTS (last 30d) ==",
    daily.points.map((p) => `${new Date(p.t).toISOString().slice(0, 10)}:${p.value}`).join(" "),
    "",
    "== RECENT ANOMALIES (statistically detected) ==",
    anomalies.length
      ? anomalies.map((a) => `  [${a.severity}] ${a.message} (detected ${a.detectedAt.toISOString().slice(0, 10)})`).join("\n")
      : "  None detected in the last 14 days",
    "",
    "Note: prior-week comparison values appear under 'Previous week comparison'.",
  ];

  return lines.join("\n");
}

const INSIGHT_SYSTEM_PROMPT = `You are the analytics copilot inside InsightFlow, a product analytics platform.
You answer questions STRICTLY using the aggregated analytics context provided.
Rules:
- Only use numbers present in the context. Never invent metrics.
- If the context does not contain enough data to answer, say so clearly and suggest what data would be needed.
- Be concise and specific. Use the project's real numbers.
- Format with short paragraphs or bullet lists. No more than ~250 words.
- If asked about anomalies, refer only to the statistically-detected anomalies listed.`;

export { INSIGHT_SYSTEM_PROMPT };
