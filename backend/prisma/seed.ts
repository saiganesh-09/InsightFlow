/**
 * InsightFlow demo seed.
 *
 * Creates a demo account + project + API key and ~45 days of realistic
 * analytics events (users, sessions, conversion funnels, traffic sources,
 * devices) including a deliberately injected anomaly so detection can be
 * demonstrated. Demo data is clearly marked via userId prefix `demo_`.
 *
 * Usage: npm run db:seed   (after `prisma migrate dev`)
 * Reset: npm run db:reset
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import crypto from "node:crypto";
import "dotenv/config";

const prisma = new PrismaClient();

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const weighted = <T,>(pairs: [T, number][]): T => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[0][0];
};

const PAGES = [
  "/", "/products", "/products/1", "/products/2", "/products/3",
  "/pricing", "/features", "/about", "/blog/launch", "/checkout", "/docs",
];
const SOURCES: [string, number][] = [
  ["direct", 35], ["google", 30], ["facebook", 10], ["twitter", 8],
  ["bing", 5], ["newsletter", 7], ["github", 5],
];
const DEVICES: [string, number][] = [["desktop", 62], ["mobile", 30], ["tablet", 8]];
const BROWSERS: Record<string, string[]> = {
  desktop: ["Chrome", "Firefox", "Edge", "Safari"],
  mobile: ["Chrome", "Safari"],
  tablet: ["Safari", "Chrome"],
};
const OS: Record<string, string[]> = {
  desktop: ["Windows", "macOS", "Linux"],
  mobile: ["iOS", "Android"],
  tablet: ["iOS", "Android"],
};
const COUNTRIES: [string, number][] = [
  ["US", 40], ["DE", 12], ["GB", 10], ["IN", 15], ["BR", 8], ["FR", 8], ["CA", 7],
];

const USER_COUNT = 420;
const DAYS = 45;

async function main() {
  console.log("Seeding InsightFlow demo data…");

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@insightflow.dev";
  const demoEmail = process.env.SEED_DEMO_EMAIL ?? "demo@insightflow.dev";

  const [admin, demo] = await Promise.all([
    prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: "Admin",
        passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "Admin123!", 12),
        role: "ADMIN",
      },
    }),
    prisma.user.upsert({
      where: { email: demoEmail },
      update: {},
      create: {
        email: demoEmail,
        name: "Demo User",
        passwordHash: await bcrypt.hash(process.env.SEED_DEMO_PASSWORD ?? "Demo123!", 12),
        role: "USER",
      },
    }),
  ]);
  console.log(`  users: ${admin.email} (admin), ${demo.email}`);

  const project = await prisma.project.upsert({
    where: { id: "demo-project" },
    update: {},
    create: {
      id: "demo-project",
      name: "Acme Storefront",
      description: "Demo analytics project seeded with realistic e-commerce traffic",
      websiteUrl: "https://acme-store.example.com",
      ownerId: demo.id,
    },
  });

  // Fresh API key (plaintext printed once below)
  await prisma.apiKey.deleteMany({ where: { projectId: project.id } });
  const secret = crypto.randomBytes(24).toString("hex");
  const plaintextKey = `if_live_${secret}`;
  const keyHash = crypto.createHash("sha256").update(plaintextKey).digest("hex");
  await prisma.apiKey.create({
    data: {
      projectId: project.id,
      name: "Seed key",
      prefix: plaintextKey.slice(0, 12),
      lastFour: plaintextKey.slice(-4),
      keyHash,
    },
  });

  // ─── Generate events ──────────────────────────────────────────────
  console.log("  generating events…");
  const events: Prisma.EventCreateManyInput[] = [];
  const sessions = new Map<string, Prisma.SessionCreateManyInput>();

  const userCountry = new Map<number, string>();
  const userDevice = new Map<number, string>();
  for (let u = 0; u < USER_COUNT; u++) {
    userCountry.set(u, weighted(COUNTRIES));
    userDevice.set(u, weighted(DEVICES));
  }

  const now = Date.now();
  const pushEvent = (e: Prisma.EventCreateManyInput) => {
    events.push(e);
    const key = `${e.projectId}:${e.sessionId}`;
    const conv = ["PURCHASE", "SIGNUP", "CHECKOUT"].includes(e.name);
    const existing = sessions.get(key);
    const ts = e.timestamp as Date;
    if (!existing) {
      sessions.set(key, {
        projectId: e.projectId,
        sessionId: e.sessionId as string,
        userId: e.userId as string,
        startedAt: ts,
        lastEventAt: ts,
        eventCount: 1,
        page: e.page,
        device: e.device,
        browser: e.browser,
        os: e.os,
        country: e.country,
        source: e.source,
        converted: conv,
      });
    } else {
      existing.eventCount = (existing.eventCount ?? 0) + 1;
      if (ts < existing.startedAt) existing.startedAt = ts;
      if (ts > existing.lastEventAt) existing.lastEventAt = ts;
      if (conv) existing.converted = true;
    }
  };

  for (let day = DAYS; day >= 0; day--) {
    // Traffic grows over time with weekly seasonality + noise
    const growth = 1 + (DAYS - day) * 0.012;
    const dayOfWeek = new Date(now - day * 86400_000).getDay();
    const weekendDip = dayOfWeek === 0 || dayOfWeek === 6 ? 0.75 : 1;
    // Injected anomaly: payment failures spike 2 days ago, traffic spike yesterday
    const failureSpike = day === 2 ? 8 : 1;
    const trafficSpike = day === 1 ? 1.9 : 1;

    const activeUsers = Math.floor((60 + rand(-10, 15)) * growth * weekendDip * trafficSpike);

    for (let i = 0; i < activeUsers; i++) {
      const uid = rand(0, USER_COUNT - 1);
      const device = userDevice.get(uid)!;
      const sessionsToday = Math.random() < 0.25 ? 2 : 1;

      for (let s = 0; s < sessionsToday; s++) {
        const sessionStart = new Date(
          now - day * 86400_000 - rand(0, 18) * 3600_000 - rand(0, 3599_000)
        );
        if (sessionStart.getTime() > now) continue;

        const sid = `demo_s_${uid}_${day}_${s}`;
        const userId = `demo_u_${uid}`;
        const source = weighted(SOURCES);
        const browser = pick(BROWSERS[device]);
        const os = pick(OS[device]);
        const country = userCountry.get(uid)!;
        let t = sessionStart.getTime();
        const step = () => (t += rand(4, 90) * 1000);

        const base = {
          projectId: project.id,
          userId,
          sessionId: sid,
          device,
          browser,
          os,
          country,
          source,
        };
        const ev = (name: string, page: string | null, props?: Record<string, unknown>) =>
          pushEvent({ ...base, name, page, properties: props as Prisma.InputJsonValue, timestamp: new Date(step()) });

        // Funnel: PAGE_VIEW → PRODUCT_VIEW → ADD_TO_CART → CHECKOUT → PURCHASE
        ev("PAGE_VIEW", pick(PAGES.slice(0, 5)));
        if (Math.random() < 0.55) {
          ev("PRODUCT_VIEW", pick(["/products/1", "/products/2", "/products/3"]), { productId: String(rand(1, 3)) });
          if (Math.random() < 0.5) {
            ev("ADD_TO_CART", "/products", { productId: String(rand(1, 3)), price: rand(19, 199) });
            if (Math.random() < 0.55) {
              ev("CHECKOUT", "/checkout", { cartSize: rand(1, 4) });
              // Baseline ~7% payment failures — spike day has ~45%
              const failRate = 0.07 * failureSpike;
              if (Math.random() < failRate) {
                ev("PAYMENT_FAILED", "/checkout", { reason: pick(["card_declined", "insufficient_funds", "3ds_timeout"]) });
              } else if (Math.random() < 0.82) {
                ev("PURCHASE", "/checkout", { orderId: `ord_${rand(10_000, 99_999)}`, total: rand(19, 400) });
              }
            }
          }
        }
        if (Math.random() < 0.3) ev("SEARCH", "/", { query: pick(["shoes", "jacket", "watch", "bag"]) });
        if (Math.random() < 0.2) ev("BUTTON_CLICK", "/pricing", { button: "cta" });
        if (Math.random() < 0.08) ev("VIDEO_PLAY", "/features", { video: "intro" });
        if (Math.random() < 0.12) ev("SIGNUP", "/", {});
        if (Math.random() < 0.3) ev("PAGE_VIEW", pick(PAGES));
      }
    }
  }

  // A burst of very recent events so the realtime page isn't empty
  for (let i = 0; i < 30; i++) {
    const uid = rand(0, USER_COUNT - 1);
    const device = userDevice.get(uid)!;
    pushEvent({
      projectId: project.id,
      userId: `demo_u_${uid}`,
      sessionId: `demo_s_live_${i}`,
      name: pick(["PAGE_VIEW", "PRODUCT_VIEW", "BUTTON_CLICK", "ADD_TO_CART", "SEARCH"]),
      page: pick(PAGES),
      device,
      browser: pick(BROWSERS[device]),
      os: pick(OS[device]),
      country: userCountry.get(uid),
      source: weighted(SOURCES),
      timestamp: new Date(now - rand(1, 280) * 1000),
    });
  }

  // Clear old demo events + insert fresh
  await prisma.event.deleteMany({ where: { projectId: project.id, userId: { startsWith: "demo_" } } });
  await prisma.session.deleteMany({ where: { projectId: project.id, userId: { startsWith: "demo_" } } });

  const BATCH = 5000;
  for (let i = 0; i < events.length; i += BATCH) {
    await prisma.event.createMany({ data: events.slice(i, i + BATCH) });
  }
  const sessionRows = [...sessions.values()];
  for (let i = 0; i < sessionRows.length; i += BATCH) {
    await prisma.session.createMany({ data: sessionRows.slice(i, i + BATCH) });
  }
  console.log(`  inserted ${events.length} events, ${sessionRows.length} sessions`);

  // Default funnel
  await prisma.funnel.deleteMany({ where: { projectId: project.id } });
  await prisma.funnel.create({
    data: {
      projectId: project.id,
      name: "Purchase funnel",
      windowDays: 7,
      steps: {
        create: ["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT", "PURCHASE"].map(
          (eventName, order) => ({ eventName, order })
        ),
      },
    },
  });

  console.log("\nDone.");
  console.log(`  Login:  ${demoEmail} / ${process.env.SEED_DEMO_PASSWORD ?? "Demo123!"}`);
  console.log(`  Admin:  ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD ?? "Admin123!"}`);
  console.log(`  Project: ${project.name} (${project.id})`);
  console.log(`  API key (shown once): ${plaintextKey}`);
  console.log(`  Try ingestion: curl -X POST http://localhost:4000/api/events -H "x-api-key: ${plaintextKey}" -H "content-type: application/json" -d '{"event":"PAGE_VIEW","userId":"u1","sessionId":"s1","page":"/"}'`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
