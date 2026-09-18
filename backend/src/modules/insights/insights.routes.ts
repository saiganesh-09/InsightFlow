import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess } from "../../middleware/projectAccess.js";
import { validateBody } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { prisma } from "../../lib/prisma.js";
import { aiConfigured, chat } from "../ai/llm.js";
import { buildProjectContext, INSIGHT_SYSTEM_PROMPT } from "../ai/context.js";
import { config } from "../../config.js";

export const insightsRouter = Router({ mergeParams: true });
insightsRouter.use(authenticate, requireProjectAccess);

const askSchema = z.object({ question: z.string().min(3).max(500) });

insightsRouter.get(
  "/",
  wrap(async (req) => {
    const insights = await prisma.aIInsight.findMany({
      where: { projectId: req.project!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { insights, aiConfigured: aiConfigured() };
  })
);

insightsRouter.post(
  "/ask",
  validateBody(askSchema),
  wrap(async (req) => {
    const context = await buildProjectContext(req.project!.id);
    const answer = await chat(
      INSIGHT_SYSTEM_PROMPT,
      `ANALYTICS CONTEXT:\n${context}\n\nQUESTION: ${req.body.question}`
    );
    const insight = await prisma.aIInsight.create({
      data: {
        projectId: req.project!.id,
        userId: req.user!.id,
        question: req.body.question,
        answer,
        model: config.OPENAI_MODEL,
      },
    });
    return { insight };
  })
);

insightsRouter.delete(
  "/:insightId",
  wrap(async (req, res) => {
    await prisma.aIInsight.deleteMany({
      where: { id: req.params.insightId, projectId: req.project!.id },
    });
    res.status(204);
    return undefined;
  })
);
