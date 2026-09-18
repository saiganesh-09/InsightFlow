import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../lib/errors.js";
import { generateRefreshToken, sha256 } from "../../lib/crypto.js";
import { signAccessToken } from "../../middleware/authenticate.js";
import { config } from "../../config.js";

const REFRESH_COOKIE = "if_refresh";

export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  createdAt: u.createdAt,
});

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

async function issueTokens(user: User, res: import("express").Response) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + config.JWT_REFRESH_TTL_DAYS * 86400_000),
    },
  });
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return { accessToken: signAccessToken(user), user: publicUser(user) };
}

export async function register(
  input: { email: string; name: string; password: string },
  res: import("express").Response
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
  });
  return issueTokens(user, res);
}

export async function login(
  input: { email: string; password: string },
  res: import("express").Response
) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Constant-shape failure: don't reveal whether the account exists
  if (!user) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

  return issueTokens(user, res);
}

export async function refresh(rawToken: string | undefined, res: import("express").Response) {
  if (!rawToken) throw ApiError.unauthorized("No refresh token");
  const tokenHash = sha256(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    throw ApiError.unauthorized("Refresh token invalid or expired");
  }
  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) throw ApiError.unauthorized();

  // Rotate: revoke old token, issue a fresh pair
  const next = generateRefreshToken();
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedBy: sha256(next) },
  });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(next),
      expiresAt: new Date(Date.now() + config.JWT_REFRESH_TTL_DAYS * 86400_000),
    },
  });
  res.cookie(REFRESH_COOKIE, next, refreshCookieOptions());
  return { accessToken: signAccessToken(user), user: publicUser(user) };
}

export async function logout(rawToken: string | undefined, res: import("express").Response) {
  if (rawToken) {
    await prisma.refreshToken
      .update({ where: { tokenHash: sha256(rawToken) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, "Current password is incorrect", "WRONG_PASSWORD");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Invalidate all sessions on password change
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export { REFRESH_COOKIE };
