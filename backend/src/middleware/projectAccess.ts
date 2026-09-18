import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import type { MemberRole, Project } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      project?: Project;
      memberRole?: MemberRole;
    }
  }
}

/**
 * Resolves `req.params.projectId`, verifies the authenticated user has access
 * (owner or member — ADMIN app role bypasses), and attaches the project.
 */
export async function requireProjectAccess(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) return next(ApiError.unauthorized());
    const projectId = req.params.projectId;
    if (!projectId) return next(ApiError.badRequest("projectId is required"));

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return next(ApiError.notFound("Project not found"));

    const isOwner = project.ownerId === req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: req.user.id } },
      });
      if (!membership) {
        // Deliberately return 404 — don't leak the existence of other tenants' projects
        return next(ApiError.notFound("Project not found"));
      }
      req.memberRole = membership.role;
    } else {
      req.memberRole = "OWNER";
    }

    req.project = project;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require OWNER or EDITOR project role. Run after requireProjectAccess. */
export function requireProjectEditor(req: Request, _res: Response, next: NextFunction) {
  if (req.memberRole === "VIEWER") return next(ApiError.forbidden("Editor access required"));
  next();
}
