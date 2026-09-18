import type { ApiKey } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../lib/errors.js";
import { generateApiKey, sha256 } from "../../lib/crypto.js";

export const maskKey = (k: ApiKey) => ({
  id: k.id,
  name: k.name,
  masked: `${k.prefix}…${k.lastFour}`,
  prefix: k.prefix,
  status: k.status,
  lastUsedAt: k.lastUsedAt,
  createdAt: k.createdAt,
  revokedAt: k.revokedAt,
});

export async function createApiKey(projectId: string, name: string) {
  const { plaintext, prefix, lastFour, keyHash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { projectId, name, prefix, lastFour, keyHash },
  });
  return { apiKey: maskKey(key), plaintext };
}

export async function rotateApiKey(projectId: string, keyId: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id: keyId, projectId } });
  if (!existing) throw ApiError.notFound("API key not found");

  const { plaintext, prefix, lastFour, keyHash } = generateApiKey();
  const [next] = await prisma.$transaction([
    prisma.apiKey.create({
      data: { projectId, name: `${existing.name} (rotated)`, prefix, lastFour, keyHash },
    }),
    prisma.apiKey.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    }),
  ]);
  return { apiKey: maskKey(next), plaintext };
}

export async function revokeApiKey(projectId: string, keyId: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id: keyId, projectId } });
  if (!existing) throw ApiError.notFound("API key not found");
  return prisma.apiKey.update({
    where: { id: existing.id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
}

/**
 * Resolve a plaintext API key to its project. Hashes the presented key and
 * looks it up — plaintext is never stored. Returns null when invalid.
 */
export async function resolveApiKey(plaintext: string): Promise<ApiKey | null> {
  if (!plaintext.startsWith("if_live_")) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(plaintext) } });
  if (!key || key.status !== "ACTIVE") return null;
  // best-effort lastUsedAt update — don't block ingestion on it
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return key;
}
