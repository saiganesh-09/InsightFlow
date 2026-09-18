import { Worker, type Job } from "bullmq";
import { bullConnection, redisAvailable } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { generateReport } from "../modules/reports/report.service.js";
import { scanAllProjects } from "../modules/anomalies/anomaly.service.js";
import {
  JOB_ANOMALY_SCAN,
  JOB_GENERATE_REPORT,
  QUEUE_MAINTENANCE,
  QUEUE_REPORTS,
} from "./index.js";

let workers: Worker[] = [];

/**
 * Start BullMQ workers. Safe to call when Redis is down — logs a warning and
 * returns an empty list (the enqueue side degrades to inline processing).
 */
export function startWorkers(): Worker[] {
  if (workers.length) return workers;
  if (!redisAvailable()) {
    logger.warn("Redis unavailable — background workers not started");
    return [];
  }

  const reportsWorker = new Worker(
    QUEUE_REPORTS,
    async (job: Job) => {
      if (job.name === JOB_GENERATE_REPORT) {
        const { reportId } = job.data as { reportId: string };
        logger.info(`Processing report job ${job.id} (report ${reportId})`);
        await generateReport(reportId);
      }
    },
    { connection: bullConnection(), concurrency: 2 }
  );

  const maintenanceWorker = new Worker(
    QUEUE_MAINTENANCE,
    async (job: Job) => {
      if (job.name === JOB_ANOMALY_SCAN) {
        const created = await scanAllProjects();
        if (created > 0) logger.info(`Anomaly scan created ${created} anomalies`);
      }
    },
    { connection: bullConnection(), concurrency: 1 }
  );

  for (const w of [reportsWorker, maintenanceWorker]) {
    w.on("failed", (job, err) =>
      logger.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`)
    );
    w.on("error", (err) => logger.error(`Worker error: ${err.message}`));
  }

  workers = [reportsWorker, maintenanceWorker];
  logger.info("BullMQ workers started (reports, maintenance)");
  return workers;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  workers = [];
}
