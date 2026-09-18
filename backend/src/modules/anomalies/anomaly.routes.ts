import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess } from "../../middleware/projectAccess.js";
import { validateQuery } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { prisma } from "../../lib/prisma.js";
import { scanProject } from "./anomaly.service.js";

export const anomaliesRouter = Router({ mergeParams: true });
anomaliesRouter.use(authenticate, requireProjectAccess);

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

anomaliesRouter.get(
  "/",
  validateQuery(listQuery),
  wrap(async (req) => {
    const q = req.validatedQuery as z.infer<typeof listQuery>;
    const anomalies = await prisma.anomaly.findMany({
      where: { projectId: req.project!.id, ...(q.severity ? { severity: q.severity } : {}) },
      orderBy: { detectedAt: "desc" },
      take: q.limit,
    });
    return { anomalies };
  })
);

/** Manually trigger a scan (useful for demos/testing). */
anomaliesRouter.post(
  "/scan",
  wrap(async (req) => ({ created: await scanProject(req.project!.id) }))
);
