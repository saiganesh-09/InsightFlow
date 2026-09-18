import http from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { awaitRedisReady, getRedis } from "./lib/redis.js";
import { createSocketServer } from "./realtime/socket.js";
import { scheduleAnomalyScan, closeQueues } from "./queues/index.js";
import { startWorkers, stopWorkers } from "./queues/workers.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  getRedis(); // initialize connection early

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  // Start embedded workers + scheduled jobs when Redis is available.
  // In production you can instead run `npm run start:worker` as a separate process.
  await awaitRedisReady(3000);
  startWorkers();
  await scheduleAnomalyScan().catch((err) =>
    logger.warn(`Could not schedule anomaly scan: ${(err as Error).message}`)
  );

  server.listen(config.PORT, () => {
    logger.info(`InsightFlow API listening on http://localhost:${config.PORT}`);
    logger.info(`API docs: http://localhost:${config.PORT}/api-docs`);
    logger.info(`Demo page: http://localhost:${config.PORT}/demo`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close();
    await stopWorkers();
    await closeQueues();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${(err as Error).message}`, { stack: err.stack });
  process.exit(1);
});
