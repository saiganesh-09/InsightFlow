import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess, requireProjectEditor } from "../../middleware/projectAccess.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { rangeQuerySchema, resolveRange } from "../analytics/filters.js";

export const funnelsRouter = Router({ mergeParams: true });
funnelsRouter.use(authenticate, requireProjectAccess);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
  steps: z.array(z.string().min(1).max(64)).min(2).max(8),
});

// ─── CRUD ────────────────────────────────────────────────────────────

funnelsRouter.get(
  "/",
  wrap(async (req) => {
    const funnels = await prisma.funnel.findMany({
      where: { projectId: req.project!.id },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return { funnels };
  })
);

funnelsRouter.post(
  "/",
  requireProjectEditor,
  validateBody(createSchema),
  wrap(async (req) => {
    const funnel = await prisma.funnel.create({
      data: {
        projectId: req.project!.id,
        name: req.body.name,
        windowDays: req.body.windowDays,
        steps: {
          create: req.body.steps.map((eventName: string, i: number) => ({
            eventName: eventName.toUpperCase(),
            order: i,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    return { funnel };
  })
);

funnelsRouter.delete(
  "/:funnelId",
  requireProjectEditor,
  wrap(async (req, res) => {
    const existing = await prisma.funnel.findFirst({
      where: { id: req.params.funnelId, projectId: req.project!.id },
    });
    if (!existing) throw ApiError.notFound("Funnel not found");
    await prisma.funnel.delete({ where: { id: existing.id } });
    res.status(204);
    return undefined;
  })
);

// ─── Results ─────────────────────────────────────────────────────────
//
// Step semantics: a user reaches step i when they have performed step i's
// event at a time >= the timestamp at which they completed step i-1, within
// the funnel's completion window. Counts are unique users.

funnelsRouter.get(
  "/:funnelId/results",
  validateQuery(rangeQuerySchema),
  wrap(async (req) => {
    const funnel = await prisma.funnel.findFirst({
      where: { id: req.params.funnelId, projectId: req.project!.id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!funnel) throw ApiError.notFound("Funnel not found");
    const r = resolveRange(req.validatedQuery as never);
    const stepNames = funnel.steps.map((s) => s.eventName);

    // For each prefix length k, count users who completed steps 0..k in order.
    const counts: number[] = [];
    for (let k = 0; k < stepNames.length; k++) {
      const joins: Prisma.Sql[] = [];
      for (let i = 1; i <= k; i++) {
        joins.push(
          Prisma.sql`JOIN f f${Prisma.raw(String(i))}
            ON f${Prisma.raw(String(i))}."userId" = f0."userId"
           AND f${Prisma.raw(String(i))}.name = ${stepNames[i]}
           AND f${Prisma.raw(String(i))}.ts >= f${Prisma.raw(String(i - 1))}.ts
           AND f${Prisma.raw(String(i))}.ts <= f${Prisma.raw(String(i - 1))}.ts + (${funnel.windowDays} * INTERVAL '1 day')`
        );
      }
      const [row] = await prisma.$queryRaw<[{ n: bigint }]>(
        Prisma.sql`WITH f AS (
            SELECT "userId", name, MIN("timestamp") AS ts
            FROM "Event"
            WHERE "projectId" = ${req.project!.id}
              AND name IN (${Prisma.join(stepNames.map((s) => Prisma.sql`${s}`))})
              AND "timestamp" >= ${r.from} AND "timestamp" <= ${r.to}
            GROUP BY "userId", name
          )
          SELECT COUNT(DISTINCT f0."userId")::int AS n
          FROM f f0
          ${joins.length ? Prisma.join(joins, " ") : Prisma.empty}
          WHERE f0.name = ${stepNames[0]}`
      );
      counts.push(Number(row.n));
    }

    const steps = funnel.steps.map((s, i) => ({
      order: s.order,
      eventName: s.eventName,
      users: counts[i],
      conversionFromStart: counts[0] > 0 ? counts[i] / counts[0] : 0,
      conversionFromPrevious: i === 0 ? 1 : counts[i - 1] > 0 ? counts[i] / counts[i - 1] : 0,
      dropOff: i === 0 ? 0 : counts[i - 1] - counts[i],
    }));

    return {
      funnel: { id: funnel.id, name: funnel.name, windowDays: funnel.windowDays },
      steps,
      overallConversion: counts.length && counts[0] > 0 ? counts[counts.length - 1] / counts[0] : 0,
      entered: counts[0] ?? 0,
      completed: counts[counts.length - 1] ?? 0,
    };
  })
);
