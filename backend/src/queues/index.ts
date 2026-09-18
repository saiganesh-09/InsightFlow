import { Queue } from "bullmq";
import { bullConnection, redisAvailable } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const QUEUE_REPORTS = "insightflow-reports";
export const QUEUE_MAINTENANCE = "insightflow-maintenance";

export const JOB_GENERATE_REPORT = "generate-report";
export const JOB_ANOMALY_SCAN = "anomaly-scan";

let reportsQueue: Queue | null = null;
let maintenanceQueue: Queue | null = null;

function getQueue(name: string): Queue | null {
  if (!redisAvailable()) return null;
  try {
    return new Queue(name, { connection: bullConnection() });
  } catch (err) {
    logger.warn(`Failed to create queue ${name}: ${(err as Error).message}`);
    return null;
  }
}

export function getReportsQueue(): Queue | null {
  reportsQueue ??= getQueue(QUEUE_REPORTS);
  return reportsQueue;
}

export function getMaintenanceQueue(): Queue | null {
  maintenanceQueue ??= getQueue(QUEUE_MAINTENANCE);
  return maintenanceQueue;
}

/**
 * Enqueue report generation. Returns the BullMQ job id, or null when Redis is
 * unavailable (caller should then run generation inline).
 */
export async function enqueueReportGeneration(reportId: string): Promise<string | null> {
  const queue = getReportsQueue();
  if (!queue) return null;
  const job = await queue.add(
    JOB_GENERATE_REPORT,
    { reportId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
  return job.id ?? null;
}

/** Register the repeatable anomaly scan (every 30 min). Idempotent. */
export async function scheduleAnomalyScan(): Promise<void> {
  const queue = getMaintenanceQueue();
  if (!queue) return;
  await queue.add(
    JOB_ANOMALY_SCAN,
    {},
    {
      repeat: { pattern: "*/30 * * * *" },
      jobId: "anomaly-scan-repeat",
      removeOnComplete: 20,
      removeOnFail: 50,
    }
  );
  logger.info("Scheduled repeatable anomaly scan (*/30 * * * *)");
}

export async function closeQueues(): Promise<void> {
  await reportsQueue?.close().catch(() => undefined);
  await maintenanceQueue?.close().catch(() => undefined);
  reportsQueue = null;
  maintenanceQueue = null;
}
