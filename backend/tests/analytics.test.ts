import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  createApiKey,
  createProject,
  dbAvailable,
  registerUser,
  sendEvents,
  testApp,
} from "./helpers.js";

const dbOk = await dbAvailable();
let app: Express;

beforeAll(async () => {
  app = await testApp();
});

describe.skipIf(!dbOk)("event ingestion", () => {
  it("accepts a valid event", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    const res = await request(app)
      .post("/api/events")
      .set("x-api-key", key)
      .send({ event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/" })
      .expect(200);
    expect(res.body.accepted).toBe(1);
  });

  it("accepts a batch", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    const res = await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/" },
      { event: "ADD_TO_CART", userId: "u1", sessionId: "s1", page: "/products", properties: { productId: "1" } },
    ]);
    expect(res.body.accepted).toBe(2);
  });

  it("rejects invalid API keys / missing key", async () => {
    await request(app)
      .post("/api/events")
      .send({ event: "PAGE_VIEW", userId: "u", sessionId: "s" })
      .expect(401);
    await request(app)
      .post("/api/events")
      .set("x-api-key", "if_live_" + "0".repeat(48))
      .send({ event: "PAGE_VIEW", userId: "u", sessionId: "s" })
      .expect(401);
  });

  it("rejects malformed events with 400", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    await request(app)
      .post("/api/events")
      .set("x-api-key", key)
      .send({ event: "PAGE_VIEW" })
      .expect(400);
    await request(app)
      .post("/api/events")
      .set("x-api-key", key)
      .send({ event: "bad name!", userId: "u", sessionId: "s" })
      .expect(400);
  });
});

describe.skipIf(!dbOk)("analytics engine", () => {
  it("computes overview metrics from real events", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);

    // 2 users, 3 sessions: u1×2 sessions (one converts), u2×1 session
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/" },
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/products" },
      { event: "PURCHASE", userId: "u1", sessionId: "s1", page: "/checkout" },
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s2", page: "/" },
      { event: "PAGE_VIEW", userId: "u2", sessionId: "s3", page: "/pricing" },
    ]);

    const res = await request(app)
      .get(`/api/projects/${p.id}/analytics/overview`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);

    expect(res.body.events).toBe(5);
    expect(res.body.users).toBe(2);
    expect(res.body.sessions).toBe(3);
    expect(res.body.conversions).toBe(1);
    // 1 of 3 sessions converted
    expect(res.body.conversionRate).toBeCloseTo(1 / 3, 2);
  });

  it("timeseries buckets events per day", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400_000);
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u", sessionId: "s", timestamp: today.toISOString() },
      { event: "PAGE_VIEW", userId: "u", sessionId: "s", timestamp: today.toISOString() },
      { event: "PAGE_VIEW", userId: "u", sessionId: "s", timestamp: yesterday.toISOString() },
    ]);
    const res = await request(app)
      .get(`/api/projects/${p.id}/analytics/timeseries?metric=events&interval=day`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    const total = res.body.points.reduce((a: number, x: { value: number }) => a + x.value, 0);
    expect(total).toBe(3);
  });

  it("top pages and top events aggregate correctly", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/a" },
      { event: "PAGE_VIEW", userId: "u2", sessionId: "s2", page: "/a" },
      { event: "PAGE_VIEW", userId: "u3", sessionId: "s3", page: "/b" },
      { event: "SEARCH", userId: "u1", sessionId: "s1", page: "/a" },
    ]);
    const pages = await request(app)
      .get(`/api/projects/${p.id}/analytics/top-pages`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(pages.body.pages[0]).toMatchObject({ page: "/a", views: 2, users: 2 });

    const events = await request(app)
      .get(`/api/projects/${p.id}/analytics/top-events`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(events.body.events[0].name).toBe("PAGE_VIEW");
    expect(events.body.events[0].count).toBe(3);
  });

  it("sessions endpoint reports duration + conversion", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    const t0 = new Date(Date.now() - 60_000);
    const t1 = new Date();
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "sess1", page: "/", timestamp: t0.toISOString() },
      { event: "PURCHASE", userId: "u1", sessionId: "sess1", page: "/checkout", timestamp: t1.toISOString() },
    ]);
    const res = await request(app)
      .get(`/api/projects/${p.id}/analytics/sessions`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    const s = res.body.sessions.find((x: { sessionId: string }) => x.sessionId === "sess1");
    expect(s).toBeTruthy();
    expect(s.eventCount).toBe(2);
    expect(s.converted).toBe(true);
    expect(s.durationSec).toBeGreaterThanOrEqual(55);
  });

  it("event explorer filters and paginates", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "s1", page: "/a" },
      { event: "SEARCH", userId: "u1", sessionId: "s1", page: "/a" },
      { event: "SEARCH", userId: "u2", sessionId: "s2", page: "/b" },
    ]);
    const res = await request(app)
      .get(`/api/projects/${p.id}/analytics/events?name=SEARCH`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.eventNames).toContain("SEARCH");
  });
});

describe.skipIf(!dbOk)("funnels", () => {
  it("computes ordered step conversion", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);

    // u1 completes full funnel; u2 stops after step 2; u3 does step 1 only
    await sendEvents(app, key, [
      { event: "PAGE_VIEW", userId: "u1", sessionId: "a", timestamp: new Date(Date.now() - 4000).toISOString() },
      { event: "PRODUCT_VIEW", userId: "u1", sessionId: "a", timestamp: new Date(Date.now() - 3000).toISOString() },
      { event: "PURCHASE", userId: "u1", sessionId: "a", timestamp: new Date(Date.now() - 2000).toISOString() },
      { event: "PAGE_VIEW", userId: "u2", sessionId: "b", timestamp: new Date(Date.now() - 4000).toISOString() },
      { event: "PRODUCT_VIEW", userId: "u2", sessionId: "b", timestamp: new Date(Date.now() - 3000).toISOString() },
      { event: "PAGE_VIEW", userId: "u3", sessionId: "c", timestamp: new Date(Date.now() - 4000).toISOString() },
    ]);

    const created = await request(app)
      .post(`/api/projects/${p.id}/funnels`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ name: "Test", steps: ["PAGE_VIEW", "PRODUCT_VIEW", "PURCHASE"] })
      .expect(200);

    const res = await request(app)
      .get(`/api/projects/${p.id}/funnels/${created.body.funnel.id}/results`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);

    expect(res.body.steps[0].users).toBe(3);
    expect(res.body.steps[1].users).toBe(2);
    expect(res.body.steps[2].users).toBe(1);
    expect(res.body.overallConversion).toBeCloseTo(1 / 3, 2);
  });

  it("rejects out-of-order completion", async () => {
    const u = await registerUser(app);
    const p = await createProject(app, u.accessToken);
    const key = await createApiKey(app, u.accessToken, p.id);
    // u1 does PURCHASE before PAGE_VIEW — must NOT count
    await sendEvents(app, key, [
      { event: "PURCHASE", userId: "u1", sessionId: "a", timestamp: new Date(Date.now() - 4000).toISOString() },
      { event: "PAGE_VIEW", userId: "u1", sessionId: "a", timestamp: new Date(Date.now() - 3000).toISOString() },
    ]);
    const created = await request(app)
      .post(`/api/projects/${p.id}/funnels`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .send({ name: "T", steps: ["PAGE_VIEW", "PURCHASE"] })
      .expect(200);
    const res = await request(app)
      .get(`/api/projects/${p.id}/funnels/${created.body.funnel.id}/results`)
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(res.body.steps[0].users).toBe(1);
    expect(res.body.steps[1].users).toBe(0);
  });
});
