import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireProjectAccess, requireProjectEditor } from "../../middleware/projectAccess.js";
import { validateBody } from "../../middleware/validate.js";
import { prisma } from "../../lib/prisma.js";
import { wrap } from "../../lib/wrap.js";
import * as service from "./apikeys.service.js";

export const apiKeysRouter = Router({ mergeParams: true });
apiKeysRouter.use(authenticate, requireProjectAccess);

const createSchema = z.object({ name: z.string().min(1).max(80).default("Default key") });

apiKeysRouter.get(
  "/",
  wrap(async (req) => {
    const keys = await prisma.apiKey.findMany({
      where: { projectId: req.project!.id },
      orderBy: { createdAt: "desc" },
    });
    return { apiKeys: keys.map(service.maskKey) };
  })
);

apiKeysRouter.post(
  "/",
  requireProjectEditor,
  validateBody(createSchema),
  wrap(async (req) => service.createApiKey(req.project!.id, req.body.name))
);

apiKeysRouter.post(
  "/:keyId/rotate",
  requireProjectEditor,
  wrap(async (req) => service.rotateApiKey(req.project!.id, req.params.keyId))
);

apiKeysRouter.delete(
  "/:keyId",
  requireProjectEditor,
  wrap(async (req, res) => {
    await service.revokeApiKey(req.project!.id, req.params.keyId);
    res.status(204);
    return undefined;
  })
);
