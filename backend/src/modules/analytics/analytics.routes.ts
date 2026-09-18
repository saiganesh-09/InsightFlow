import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess } from "../../middleware/projectAccess.js";
import { validateQuery } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import * as svc from "./analytics.service.js";
import { rangeQuerySchema, type RangeQuery } from "./filters.js";

export const analyticsRouter = Router({ mergeParams: true });
analyticsRouter.use(authenticate, requireProjectAccess);

const q = (req: { validatedQuery?: unknown }) => (req.validatedQuery ?? {}) as RangeQuery;

const timeseriesQuery = rangeQuerySchema.extend({
  metric: z.enum(["events", "users", "sessions"]).optional(),
  interval: z.enum(["hour", "day"]).optional(),
});

analyticsRouter.get(
  "/overview",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getOverview(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/timeseries",
  validateQuery(timeseriesQuery),
  wrap(async (req) => svc.getTimeseries(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/top-pages",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getTopPages(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/top-events",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getTopEvents(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/traffic-sources",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getTrafficSources(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/breakdown/:dimension",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => {
    const dim = req.params.dimension;
    if (!["device", "browser", "os", "country"].includes(dim)) {
      throw ApiError.badRequest("Invalid dimension");
    }
    return svc.getBreakdown(req.project!.id, q(req), dim as svc.Dimension);
  })
);

analyticsRouter.get(
  "/realtime",
  wrap(async (req) => svc.getRealtimeSummary(req.project!.id))
);

analyticsRouter.get(
  "/segments",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getUserSegments(req.project!.id, q(req)))
);

analyticsRouter.get(
  "/users",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => svc.getTopUsers(req.project!.id, q(req)))
);

const sessionsQuery = rangeQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

analyticsRouter.get(
  "/sessions",
  validateQuery(sessionsQuery),
  wrap(async (req) => {
    const query = req.validatedQuery as RangeQuery & { page: number; pageSize: number };
    return svc.getSessions(req.project!.id, query, query.page, query.pageSize);
  })
);

// ─── Event explorer (paginated, filtered) ────────────────────────────

const eventsQuery = rangeQuerySchema.extend({
  name: z.string().max(64).optional(),
  userId: z.string().max(128).optional(),
  sessionId: z.string().max(128).optional(),
  page: z.string().max(500).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

analyticsRouter.get(
  "/events",
  validateQuery(eventsQuery),
  wrap(async (req) => {
    const query = req.validatedQuery as z.infer<typeof eventsQuery>;
    const where: Record<string, unknown> = { projectId: req.project!.id };
    if (query.name) where.name = query.name;
    if (query.userId) where.userId = query.userId;
    if (query.page) where.page = { contains: query.page };
    if (query.sessionId) where.sessionId = query.sessionId;
    if (query.from || query.to) {
      where.timestamp = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [total, events, eventNames] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      prisma.event.findMany({
        where: { projectId: req.project!.id },
        select: { name: true },
        distinct: ["name"],
        orderBy: { name: "asc" },
      }),
    ]);

    const hasMore = events.length > query.limit;
    const items = hasMore ? events.slice(0, query.limit) : events;
    return {
      events: items,
      total,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      eventNames: eventNames.map((e) => e.name),
    };
  })
);
