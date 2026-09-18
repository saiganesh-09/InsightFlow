import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess } from "../../middleware/projectAccess.js";
import { validateQuery } from "../../middleware/validate.js";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import * as analytics from "../analytics/analytics.service.js";
import { rangeQuerySchema, resolveRange } from "../analytics/filters.js";

export const exportsRouter = Router({ mergeParams: true });
exportsRouter.use(authenticate, requireProjectAccess);

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res: Response, filename: string, header: string[], rows: unknown[][]) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const lines = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))];
  res.send(lines.join("\n"));
}

const eventsCsvQuery = rangeQuerySchema.extend({
  name: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50_000).default(10_000),
});

/** GET /export/events.csv — raw event export scoped to the project. */
exportsRouter.get("/events.csv", validateQuery(eventsCsvQuery), async (req, res, next) => {
  try {
    const q = req.validatedQuery as z.infer<typeof eventsCsvQuery>;
    const where: Record<string, unknown> = { projectId: req.project!.id };
    if (q.name) where.name = q.name;
    if (q.from || q.to) {
      where.timestamp = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
    }
    const events = await prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: q.limit,
    });
    sendCsv(
      res,
      `events-${req.project!.id}.csv`,
      ["id", "name", "userId", "sessionId", "page", "device", "browser", "os", "country", "source", "timestamp", "properties"],
      events.map((e) => [
        e.id, e.name, e.userId, e.sessionId, e.page, e.device, e.browser,
        e.os, e.country, e.source, e.timestamp.toISOString(), e.properties,
      ])
    );
  } catch (err) {
    next(err);
  }
});

const analyticsCsvQuery = rangeQuerySchema.extend({
  dataset: z.enum(["timeseries", "top-pages", "top-events", "traffic-sources"]).default("timeseries"),
  metric: z.enum(["events", "users", "sessions"]).default("events"),
});

/** GET /export/analytics.csv — aggregated analytics export. */
exportsRouter.get("/analytics.csv", validateQuery(analyticsCsvQuery), async (req, res, next) => {
  try {
    const q = req.validatedQuery as z.infer<typeof analyticsCsvQuery>;
    const pid = req.project!.id;
    switch (q.dataset) {
      case "top-pages": {
        const d = await analytics.getTopPages(pid, q, 100);
        return sendCsv(res, `top-pages-${pid}.csv`, ["page", "views", "users"],
          d.pages.map((p) => [p.page, p.views, p.users]));
      }
      case "top-events": {
        const d = await analytics.getTopEvents(pid, q, 100);
        return sendCsv(res, `top-events-${pid}.csv`, ["name", "count", "users"],
          d.events.map((e) => [e.name, e.count, e.users]));
      }
      case "traffic-sources": {
        const d = await analytics.getTrafficSources(pid, q);
        return sendCsv(res, `traffic-sources-${pid}.csv`, ["source", "sessions", "users", "events"],
          d.sources.map((s) => [s.source, s.sessions, s.users, s.events]));
      }
      default: {
        const d = await analytics.getTimeseries(pid, { ...q, metric: q.metric });
        return sendCsv(res, `timeseries-${q.metric}-${pid}.csv`, ["bucket", q.metric],
          d.points.map((p) => [new Date(p.t).toISOString(), p.value]));
      }
    }
  } catch (err) {
    next(err);
  }
});
