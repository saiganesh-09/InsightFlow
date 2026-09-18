/**
 * Zero-install dev Postgres.
 *
 * `npm run db:dev` — initialises (first run), starts a real PostgreSQL 18
 * cluster in .tools/pgdata, creates the `insightflow` database, and keeps it
 * running in the foreground until Ctrl+C (like `docker compose up`).
 *
 * Then: DATABASE_URL="postgresql://insightflow:insightflow@localhost:5432/insightflow"
 * (same credentials as docker-compose.yml — one .env works for both)
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// NOTE: data lives in ~/.insightflow — NOT inside the repo. Postgres child
// processes crash when their files sit under OneDrive/Dropbox-synced paths.
const databaseDir = path.join(os.homedir(), ".insightflow", "pgdata");
const port = Number(process.env.DEV_PG_PORT ?? 5432);
const dbName = process.env.DEV_PG_DB ?? "insightflow";

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "insightflow",
  password: "insightflow",
  persistent: true,
  onLog: (m) => process.stdout.write(`[pg] ${m}`),
  onError: (m) => process.stderr.write(`[pg] ${m}\n`),
});

const firstRun = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));
if (firstRun) {
  console.log("Initialising Postgres cluster…");
  await pg.initialise();
}

console.log(`Starting Postgres on :${port} (data: ${databaseDir})`);
await pg.start();

const client = pg.getPgClient();
await client.connect();
await client.query(`CREATE DATABASE ${dbName}`).catch(() => {});
await client.end();

console.log(`\nPostgres ready → postgresql://insightflow:insightflow@localhost:${port}/${dbName}`);
console.log("Run `npx prisma migrate deploy` + `npm run db:seed` in another terminal.");
console.log("Ctrl+C to stop.\n");

await new Promise(() => {});
