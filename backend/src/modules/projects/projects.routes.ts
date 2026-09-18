import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import { requireProjectAccess, requireProjectEditor } from "../../middleware/projectAccess.js";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../lib/errors.js";
import { wrap } from "../../lib/wrap.js";

export const projectsRouter = Router();
projectsRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(2000).optional().nullable(),
  websiteUrl: z.string().url().max(500).optional().nullable().or(z.literal("").transform(() => null)),
});

const updateSchema = createSchema.partial();

const addMemberSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  role: z.enum(["EDITOR", "VIEWER"]).default("VIEWER"),
});

/** List all projects the user owns or is a member of. */
projectsRouter.get(
  "/",
  wrap(async (req) => {
    const userId = req.user!.id;
    const projects = await prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { events: true } },
        apiKeys: {
          where: { status: "ACTIVE" },
          select: { id: true, prefix: true, lastFour: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        websiteUrl: p.websiteUrl,
        ownerId: p.ownerId,
        isOwner: p.ownerId === userId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        eventCount: p._count.events,
        apiKeyPreview: p.apiKeys[0] ? `${p.apiKeys[0].prefix}…${p.apiKeys[0].lastFour}` : null,
      })),
    };
  })
);

projectsRouter.post(
  "/",
  validateBody(createSchema),
  wrap(async (req) => {
    const project = await prisma.project.create({
      data: {
        name: req.body.name,
        description: req.body.description ?? null,
        websiteUrl: req.body.websiteUrl ?? null,
        ownerId: req.user!.id,
      },
    });
    return { project };
  })
);

projectsRouter.get(
  "/:projectId",
  requireProjectAccess,
  wrap(async (req) => ({ project: req.project }))
);

projectsRouter.patch(
  "/:projectId",
  requireProjectAccess,
  requireProjectEditor,
  validateBody(updateSchema),
  wrap(async (req) => {
    const project = await prisma.project.update({
      where: { id: req.project!.id },
      data: req.body,
    });
    return { project };
  })
);

projectsRouter.delete(
  "/:projectId",
  requireProjectAccess,
  wrap(async (req, res) => {
    if (req.project!.ownerId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw ApiError.forbidden("Only the project owner can delete a project");
    }
    await prisma.project.delete({ where: { id: req.project!.id } });
    res.status(204);
    return undefined;
  })
);

// ─── Members ──────────────────────────────────────────────────────────

projectsRouter.get(
  "/:projectId/members",
  requireProjectAccess,
  wrap(async (req) => {
    const members = await prisma.projectMember.findMany({
      where: { projectId: req.project!.id },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: req.project!.ownerId },
      select: { id: true, email: true, name: true },
    });
    return {
      members: [
        { userId: owner.id, email: owner.email, name: owner.name, role: "OWNER" },
        ...members.map((m) => ({
          userId: m.user.id,
          email: m.user.email,
          name: m.user.name,
          role: m.role,
          memberId: m.id,
        })),
      ],
    };
  })
);

projectsRouter.post(
  "/:projectId/members",
  requireProjectAccess,
  requireProjectEditor,
  validateBody(addMemberSchema),
  wrap(async (req) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!user) throw ApiError.notFound("No account exists for that email");
    if (user.id === req.project!.ownerId) throw ApiError.badRequest("User is already the owner");
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: req.project!.id, userId: user.id } },
      update: { role: req.body.role },
      create: { projectId: req.project!.id, userId: user.id, role: req.body.role },
    });
    return { member };
  })
);

projectsRouter.delete(
  "/:projectId/members/:userId",
  requireProjectAccess,
  requireProjectEditor,
  wrap(async (req, res) => {
    await prisma.projectMember
      .delete({
        where: {
          projectId_userId: { projectId: req.project!.id, userId: req.params.userId },
        },
      })
      .catch(() => {
        throw ApiError.notFound("Membership not found");
      });
    res.status(204);
    return undefined;
  })
);
