import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiKey } from "@prisma/client";
import { ApiError } from "../../lib/errors.js";
import { consumeRateLimit } from "../../lib/redis.js";
import { config } from "../../config.js";
import { validateBody } from "../../middleware/validate.js";
import { wrap } from "../../lib/wrap.js";
import { resolveApiKey } from "../apikeys/apikeys.service.js";
import { ingestEvents } from "./ingest.service.js";
import { batchEventSchema, eventSchema } from "./events.schemas.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

/** Extract `x-api-key` header or `Authorization: Bearer if_live_…`. */
function extractKey(req: Request): string | null {
  const h = req.headers["x-api-key"];
  if (typeof h === "string" && h) return h.trim();
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("if_live_")) return token;
  }
  // Query-param fallback — required for navigator.sendBeacon which cannot set
  // headers. Prefer the header whenever possible.
  const qk = req.query.key;
  if (typeof qk === "string" && qk.startsWith("if_live_")) return qk;
  return null;
}

async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = extractKey(req);
    if (!raw) {
      return next(
        new ApiError(401, "Missing API key — send x-api-key header", "API_KEY_MISSING")
      );
    }
    const key = await resolveApiKey(raw);
    if (!key) {
      return next(new ApiError(401, "Invalid or revoked API key", "API_KEY_INVALID"));
    }
    req.apiKey = key;

    // Per-key rate limit (Redis fixed-window; in-memory fallback)
    const { allowed, remaining, retryAfter } = await consumeRateLimit(
      `ingest:${key.id}`,
      config.RATE_LIMIT_INGEST_PER_MINUTE,
      60
    );
    _res.setHeader("X-RateLimit-Limit", config.RATE_LIMIT_INGEST_PER_MINUTE);
    _res.setHeader("X-RateLimit-Remaining", remaining);
    if (!allowed) {
      _res.setHeader("Retry-After", retryAfter);
      return next(new ApiError(429, "Ingestion rate limit exceeded", "RATE_LIMITED", { retryAfter }));
    }
    next();
  } catch (err) {
    next(err);
  }
}

export const ingestRouter = Router();

/**
 * POST /api/events — ingest a single event.
 * POST /api/events/batch — ingest up to 100 events.
 */
ingestRouter.post(
  "/",
  apiKeyAuth,
  validateBody(eventSchema),
  wrap(async (req) => ingestEvents(req.apiKey!, [req.body], req.headers["user-agent"]))
);

ingestRouter.post(
  "/batch",
  apiKeyAuth,
  validateBody(batchEventSchema),
  wrap(async (req) => ingestEvents(req.apiKey!, req.body.events, req.headers["user-agent"]))
);
