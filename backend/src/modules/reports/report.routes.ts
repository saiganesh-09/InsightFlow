import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess, requireProjectEditor } from "../../middleware/projectAccess.js";
import { validateBody } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { enqueueReportGeneration } from "../../queues/index.js";
import { generateReport, reportToMarkdown } from "./report.service.js";
import { logger } from "../../lib/logger.js";

export const reportsRouter = Router({ mergeParams: true });
reportsRouter.use(authenticate, requireProjectAccess);

const createSchema = z.object({ type: z.enum(["WEEKLY", "MONTHLY"]) });

reportsRouter.get(
  "/",
  wrap(async (req) => {
    const reports = await prisma.report.findMany({
      where: { projectId: req.project!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, type: true, status: true, periodStart: true, periodEnd: true,
        createdAt: true, updatedAt: true, error: true,
      },
    });
    return { reports };
  })
);

reportsRouter.post(
  "/",
  requireProjectEditor,
  validateBody(createSchema),
  wrap(async (req) => {
    const days = req.body.type === "WEEKLY" ? 7 : 30;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 86400_000);

    const report = await prisma.report.create({
      data: {
        projectId: req.project!.id,
        type: req.body.type,
        periodStart,
        periodEnd,
        status: "PENDING",
      },
    });

    const jobId = await enqueueReportGeneration(report.id);
    if (jobId) {
      await prisma.report.update({ where: { id: report.id }, data: { jobId } });
    } else {
      // Redis unavailable — generate inline so the feature still works
      generateReport(report.id).catch((err) =>
        logger.error(`Inline report generation failed: ${(err as Error).message}`)
      );
    }
    return { report: { ...report, jobId } };
  })
);

reportsRouter.get(
  "/:reportId",
  wrap(async (req) => {
    const report = await prisma.report.findFirst({
      where: { id: req.params.reportId, projectId: req.project!.id },
    });
    if (!report) throw ApiError.notFound("Report not found");
    return { report };
  })
);

reportsRouter.get(
  "/:reportId/download",
  wrap(async (req, res) => {
    const report = await prisma.report.findFirst({
      where: { id: req.params.reportId, projectId: req.project!.id },
    });
    if (!report) throw ApiError.notFound("Report not found");
    if (report.status !== "COMPLETED") throw ApiError.badRequest("Report is not ready yet");

    const markdown = reportToMarkdown(report);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="insightflow-${report.type.toLowerCase()}-${report.id}.md"`
    );
    res.send(markdown);
    return undefined;
  })
);

reportsRouter.delete(
  "/:reportId",
  requireProjectEditor,
  wrap(async (req, res) => {
    await prisma.report.deleteMany({
      where: { id: req.params.reportId, projectId: req.project!.id },
    });
    res.status(204);
    return undefined;
  })
);
