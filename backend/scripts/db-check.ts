/* Real DB connectivity probe — TCP alone is not enough (a crashed postmaster
   still listens but spawns broken backends). Exits 0 on successful query. */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5433/insightflow";
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  await prisma.$queryRaw`SELECT 1`;
  console.log("DB OK");
  process.exit(0);
} catch (e) {
  console.error(`DB FAIL: ${(e as Error).message.split("\n")[0]}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
