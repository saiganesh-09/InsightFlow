import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

/**
 * Central Redis wrapper.
 *
 * The app is designed to degrade gracefully when Redis is unavailable
 * (e.g. a fresh dev machine): caching becomes a no-op, distributed rate
 * limiting falls back to in-memory, and BullMQ is skipped with a warning.
 * Set ALLOW_NO_REDIS=true in .env to tolerate a missing Redis.
 */

let client: Redis | null = null;
let available = false;
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

export function getRedis(): Redis | null {
  if (client || available) return client;
  try {
    client = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
      lazyConnect: false,
    });
    client.on("ready", () => {
      available = true;
      logger.info("Redis connected");
    });
    client.on("error", (err: Error) => {
      if (available) logger.warn(`Redis error: ${err.message}`);
      available = false;
    });
    client.on("end", () => {
      available = false;
    });
    // give the connection a moment; if it fails we log once
    client
      .ping()
      .catch(() =>
        config.ALLOW_NO_REDIS
          ? logger.warn("Redis unavailable — running in degraded mode (ALLOW_NO_REDIS=true)")
          : logger.warn(
              "Redis unavailable. Set ALLOW_NO_REDIS=true to run without it, or start Redis."
            )
      );
  } catch (err) {
    logger.warn(`Failed to initialize Redis: ${(err as Error).message}`);
    client = null;
  }
  return client;
}

export function redisAvailable(): boolean {
  getRedis();
  return available;
}

/** Wait until the Redis handshake completes (or times out). For processes
 * that require Redis at startup, e.g. the BullMQ worker. */
export async function awaitRedisReady(timeoutMs = 8000): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  if (available) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (available) return true;
    try {
      await r.ping();
      available = true;
      return true;
    } catch {
      await new Promise((res) => setTimeout(res, 200));
    }
  }
  return available;
}

/** BullMQ requires a dedicated connection per Queue/Worker. */
export function bullConnection() {
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    username: url.username || undefined,
    db: url.pathname ? Number(url.pathname.slice(1)) || 0 : 0,
    maxRetriesPerRequest: null as null,
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────

const CACHE_PREFIX = "cache:";
const VERSION_KEY = (projectId: string) => `ver:${projectId}`;

/** Bump the per-project cache version — call after writes that affect analytics. */
export async function bumpProjectVersion(projectId: string): Promise<void> {
  const r = getRedis();
  if (r && available) {
    try {
      await r.incr(VERSION_KEY(projectId));
      return;
    } catch {
      /* fall through */
    }
  }
  memoryCache.clear(); // crude but safe fallback
}

async function projectVersion(projectId: string): Promise<string> {
  const r = getRedis();
  if (r && available) {
    try {
      return (await r.get(VERSION_KEY(projectId))) ?? "0";
    } catch {
      /* ignore */
    }
  }
  return "mem";
}

/**
 * Cache-aside read. Keys are namespaced per project and automatically
 * invalidated when `bumpProjectVersion(projectId)` is called (i.e. on every
 * ingested event), so stale analytics are never served.
 */
export async function cached<T>(
  projectId: string,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const r = getRedis();
  const version = await projectVersion(projectId);
  const fullKey = `${CACHE_PREFIX}${projectId}:${version}:${key}`;

  if (r && available) {
    try {
      const hit = await r.get(fullKey);
      if (hit !== null) return JSON.parse(hit) as T;
      const value = await compute();
      await r.set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
      return value;
    } catch {
      return compute();
    }
  }

  const now = Date.now();
  const mem = memoryCache.get(fullKey);
  if (mem && mem.expiresAt > now) return JSON.parse(mem.value) as T;
  const value = await compute();
  memoryCache.set(fullKey, { value: JSON.stringify(value), expiresAt: now + ttlSeconds * 1000 });
  return value;
}

// ─── Rate limiting helper (sliding window) ────────────────────────────

/**
 * Fixed-window counter in Redis; falls back to in-memory when Redis is down.
 * Returns remaining requests in the current window, or -1 when limited.
 */
export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const r = getRedis();
  const nowSec = Math.floor(Date.now() / 1000);
  const window = Math.floor(nowSec / windowSeconds);
  const key = `rl:${bucket}:${window}`;
  const retryAfter = windowSeconds - (nowSec % windowSeconds);

  if (r && available) {
    try {
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, windowSeconds + 1);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
    } catch {
      /* fall through to memory */
    }
  }

  const mem = memoryRateLimiter(key, limit, retryAfter);
  return mem;
}

const memBuckets = new Map<string, { count: number; expiresAt: number }>();
function memoryRateLimiter(key: string, limit: number, retryAfter: number) {
  const now = Date.now();
  const b = memBuckets.get(key);
  if (!b || b.expiresAt <= now) {
    memBuckets.set(key, { count: 1, expiresAt: now + retryAfter * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfter };
  }
  b.count += 1;
  return { allowed: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter };
}
