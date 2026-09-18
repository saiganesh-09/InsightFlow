import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { dbAvailable, registerUser, testApp, uniqueEmail } from "./helpers.js";

const dbOk = await dbAvailable();
let app: Express;

beforeAll(async () => {
  app = await testApp();
});

describe.skipIf(!dbOk)("auth", () => {
  it("registers a new user and returns access token + safe user shape", async () => {
    const email = uniqueEmail("reg");
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, name: "Reg", password: "Password1" })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]?.[0]).toContain("if_refresh");
  });

  it("rejects duplicate email with 409", async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: u.email, name: "Dup", password: "Password1" })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects weak passwords", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: uniqueEmail("weak"), name: "W", password: "short" })
      .expect(400);
  });

  it("logs in with correct credentials", async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: u.email, password: "Password1" })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects wrong password with a generic 401", async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: u.email, password: "WrongPass9" })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects unknown email with the same generic 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail("ghost"), password: "Password1" })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("GET /me returns the authenticated user", async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${u.accessToken}`)
      .expect(200);
    expect(res.body.user.email).toBe(u.email);
  });

  it("rejects missing / malformed / tampered tokens", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-token")
      .expect(401);
    const u = await registerUser(app);
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${u.accessToken}tampered`)
      .expect(401);
  });

  it("refresh rotation issues a new access token and rotates the cookie", async () => {
    const email = uniqueEmail("ref");
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ email, name: "Ref", password: "Password1" })
      .expect(200);
    const res = await agent.post("/api/auth/refresh").expect(200);
    expect(res.body.accessToken).toBeTruthy();
    await agent
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it("logout revokes the refresh token", async () => {
    const email = uniqueEmail("out");
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .send({ email, name: "Out", password: "Password1" })
      .expect(200);
    await agent.post("/api/auth/logout").expect(200);
    await agent.post("/api/auth/refresh").expect(401);
  });
});
