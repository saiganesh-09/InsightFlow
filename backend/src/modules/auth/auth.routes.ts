import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import { consumeRateLimit } from "../../lib/redis.js";
import { config } from "../../config.js";
import { ApiError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { wrap } from "../../lib/wrap.js";
import * as service from "./auth.service.js";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "./auth.schemas.js";

export const authRouter = Router();

/** Simple fixed-window IP rate limit on auth endpoints (Redis-backed). */
async function authRateLimit(req: Request, _res: Response, next: NextFunction) {
  const bucket = `auth:${req.ip}`;
  const { allowed, retryAfter } = await consumeRateLimit(
    bucket,
    config.RATE_LIMIT_AUTH_PER_MINUTE,
    60
  );
  if (!allowed) {
    return next(new ApiError(429, "Too many attempts — try again later", "RATE_LIMITED", { retryAfter }));
  }
  next();
}

authRouter.post(
  "/register",
  authRateLimit,
  validateBody(registerSchema),
  wrap(async (req, res) => service.register(req.body, res))
);

authRouter.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  wrap(async (req, res) => service.login(req.body, res))
);

authRouter.post(
  "/refresh",
  authRateLimit,
  wrap(async (req, res) =>
    service.refresh(req.cookies?.[service.REFRESH_COOKIE], res)
  )
);

authRouter.post(
  "/logout",
  wrap(async (req, res) => {
    await service.logout(req.cookies?.[service.REFRESH_COOKIE], res);
    return { ok: true };
  })
);

authRouter.get(
  "/me",
  authenticate,
  wrap(async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    return { user: service.publicUser(user) };
  })
);

authRouter.patch(
  "/me",
  authenticate,
  validateBody(updateProfileSchema),
  wrap(async (req) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name: req.body.name },
    });
    return { user: service.publicUser(user) };
  })
);

authRouter.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  wrap(async (req, res) => {
    await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    // revoke caller's refresh token too — force re-login everywhere
    await service.logout(req.cookies?.[service.REFRESH_COOKIE], res);
    return { ok: true };
  })
);
