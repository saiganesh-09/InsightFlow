import { PrismaClient } from "@prisma/client";

const url = process.env.ADMIN_DATABASE_URL ?? "postgresql://postgres@localhost:5433/postgres";
const dbName = process.argv[2] ?? "insightflow";

const prisma = new PrismaClient({ datasources: { db: { url } } });

await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`).catch((e: Error) => {
  if (e.message.includes("already exists")) console.log(`Database ${dbName} already exists`);
  else throw e;
});
console.log(`Database ${dbName} ready`);
await prisma.$disconnect();
