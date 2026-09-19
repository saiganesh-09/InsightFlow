// Production bootstrap for free-tier hosts without preDeploy hooks:
// 1) apply migrations (idempotent, ~1s on warm boots)
// 2) seed demo data only when the database is empty (first deploy / fresh PG)
// 3) start the API (BullMQ workers + scheduler run embedded in index.ts)
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

execSync("npx prisma migrate deploy", { stdio: "inherit" });

const prisma = new PrismaClient();
const events = await prisma.event.count();
await prisma.$disconnect();

if (events === 0) {
  console.log("[bootstrap] empty database — running demo seed");
  execSync("npm run db:seed", { stdio: "inherit" });
} else {
  console.log(`[bootstrap] database has ${events} events — skipping seed`);
}

await import("../dist/index.js");
