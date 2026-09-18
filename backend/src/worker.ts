import { logger } from "./lib/logger.js";
import { awaitRedisReady, getRedis } from "./lib/redis.js";
import { scheduleAnomalyScan, closeQueues } from "./queues/index.js";
import { startWorkers, stopWorkers } from "./queues/workers.js";
import { prisma } from "./lib/prisma.js";

/**
 * Standalone worker process — runs BullMQ consumers and schedules repeatable
 * jobs. Use this in production so API and workers scale independently.
 */
async function main() {
  getRedis();
  if (!(await awaitRedisReady())) {
    logger.error("Workers require Redis — REDIS_URL unreachable. Exiting.");
    process.exit(1);
  }
  const workers = startWorkers();
  if (workers.length === 0) {
    logger.error("Workers require Redis — REDIS_URL unreachable. Exiting.");
    process.exit(1);
  }
  await scheduleAnomalyScan();
  logger.info("InsightFlow worker process running");

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down workers`);
    await stopWorkers();
    await closeQueues();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`Fatal worker error: ${(err as Error).message}`);
  process.exit(1);
});
