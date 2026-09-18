import { PrismaClient } from "@prisma/client";
import { isProd } from "../config.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error", "warn"] : ["warn", "error"],
  });

if (!isProd) globalForPrisma.prisma = prisma;
