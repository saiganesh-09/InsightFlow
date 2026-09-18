import type { Express } from "express";
import request from "supertest";
import crypto from "node:crypto";

/**
 * Shared test helpers.
 *
 * Integration tests require a reachable Postgres (DATABASE_URL). `dbAvailable()`
 * probes once at module load; DB-dependent suites use `describe.skipIf(!dbOk)`.
 */

let _dbOk: boolean | null = null;
export async function dbAvailable(): Promise<boolean> {
  if (_dbOk !== null) return _dbOk;
  try {
    const { prisma } = await import("../src/lib/prisma.js");
    await prisma.$queryRaw`SELECT 1`;
    _dbOk = true;
  } catch {
    _dbOk = false;
    console.warn("⚠️  Database unreachable — DB integration tests will be skipped");
  }
  return _dbOk;
}

export async function testApp(): Promise<Express> {
  const { createApp } = await import("../src/app.js");
  return createApp();
}

export function uniqueEmail(prefix = "t"): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}@test.dev`;
}

export interface TestUser {
  accessToken: string;
  userId: string;
  email: string;
}

export async function registerUser(app: Express): Promise<TestUser> {
  const email = uniqueEmail();
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, name: "Test", password: "Password1" })
    .expect(200);
  return { accessToken: res.body.accessToken, userId: res.body.user.id, email };
}

export async function createProject(app: Express, token: string) {
  const res = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Test Project", websiteUrl: "https://example.com" })
    .expect(200);
  return res.body.project as { id: string; name: string };
}

export async function createApiKey(
  app: Express,
  token: string,
  projectId: string
): Promise<string> {
  const res = await request(app)
    .post(`/api/projects/${projectId}/api-keys`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "test" })
    .expect(200);
  return res.body.plaintext as string;
}

/** Seed N events directly through the ingestion endpoint. */
export async function sendEvents(
  app: Express,
  apiKey: string,
  events: Record<string, unknown>[]
) {
  return request(app)
    .post("/api/events/batch")
    .set("x-api-key", apiKey)
    .send({ events })
    .expect(200);
}
