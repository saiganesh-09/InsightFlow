import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  createApiKey,
  createProject,
  dbAvailable,
  registerUser,
  testApp,
} from "./helpers.js";

const dbOk = await dbAvailable();
let app: Express;

beforeAll(async () => {
  app = await testApp();
});

describe.skipIf(!dbOk)("projects", () => {
  it("creates and lists projects", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    expect(p.id).toBeTruthy();

    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(res.body.projects.map((x: { id: string }) => x.id)).toContain(p.id);
  });

  it("validates project creation input", async () => {
    const u = await registerUser(app);
    await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ name: "" })
      .expect(400);
    await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ websiteUrl: "https://x.com" })
      .expect(400);
  });

  it("requires auth", async () => {
    await request(app).get("/api/projects").expect(401);
    await request(app).post("/api/projects").send({ name: "x" }).expect(401);
  });

  it("enforces project isolation between users (404, not 403)", async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const p = await createProject(app, a.accessToken);

    // User B cannot see user A's project — and the API does not leak its existence
    await request(app)
      .get(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .expect(404);
    await request(app)
      .patch(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ name: "hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .expect(404);
    await request(app)
      .get(`/api/projects/${p.id}/analytics/overview`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .expect(404);

    const list = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${b.accessToken}`)
      .expect(200);
    expect(list.body.projects.map((x: { id: string }) => x.id)).not.toContain(p.id);
  });

  it("updates and deletes a project", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const res = await request(app)
      .patch(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ name: "Renamed" })
      .expect(200);
    expect(res.body.project.name).toBe("Renamed");
    await request(app)
      .delete(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(204);
    await request(app)
      .get(`/api/projects/${p.id}`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(404);
  });
});

describe.skipIf(!dbOk)("api keys", () => {
  it("creates a key, returns plaintext once, stores only the hash", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const res = await request(app)
      .post(`/api/projects/${p.id}/api-keys`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ name: "ci" })
      .expect(200);

    expect(res.body.plaintext).toMatch(/^if_live_/);
    expect(res.body.apiKey.masked).toContain("…");
    expect(res.body.apiKey.masked).not.toContain(res.body.plaintext);

    const { prisma } = await import("../src/lib/prisma.js");
    const rows = await prisma.apiKey.findMany({ where: { projectId: p.id } });
    expect(rows[0].keyHash).toHaveLength(64);
    expect(rows.some((r) => r.keyHash === res.body.plaintext)).toBe(false);
  });

  it("lists masked keys and revokes them", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const plaintext = await createApiKey(app, u.accessToken, p.id);

    const list = await request(app)
      .get(`/api/projects/${p.id}/api-keys`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    const key = list.body.apiKeys[0];
    expect(key.masked).not.toBe(plaintext);

    await request(app)
      .delete(`/api/projects/${p.id}/api-keys/${key.id}`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(204);

    // Revoked key can no longer ingest
    await request(app)
      .post("/api/events")
      .set("x-api-key", plaintext)
      .send({ event: "PAGE_VIEW", userId: "u", sessionId: "s" })
      .expect(401);
  });

  it("rotates keys — old stops working, new works", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const old = await createApiKey(app, u.accessToken, p.id);
    const list = await request(app)
      .get(`/api/projects/${p.id}/api-keys`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);

    const rot = await request(app)
      .post(`/api/projects/${p.id}/api-keys/${list.body.apiKeys[0].id}/rotate`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);

    await request(app)
      .post("/api/events")
      .set("x-api-key", old)
      .send({ event: "PAGE_VIEW", userId: "u", sessionId: "s" })
      .expect(401);
    await request(app)
      .post("/api/events")
      .set("x-api-key", rot.body.plaintext)
      .send({ event: "PAGE_VIEW", userId: "u", sessionId: "s" })
      .expect(200);
  });
});
