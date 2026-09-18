import type { ApiKey, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { bumpProjectVersion } from "../../lib/redis.js";
import { bus, BUS_EVENT_INGESTED, type IngestedEventPayload } from "../../lib/bus.js";
import { CONVERSION_EVENTS, type EventInput } from "./events.schemas.js";

/** Minimal user-agent sniffing — clients may send explicit values instead. */
export function parseUserAgent(ua: string | undefined): {
  device?: string;
  browser?: string;
  os?: string;
} {
  if (!ua) return {};
  const s = ua.toLowerCase();
  const device = /mobile|iphone|android(?!.*tablet)|ip(hone|od)/.test(s)
    ? "mobile"
    : /ipad|tablet|android.*(tablet)/.test(s)
      ? "tablet"
      : "desktop";
  const browser = /edg\//.test(s)
    ? "Edge"
    : /chrome\//.test(s)
      ? "Chrome"
      : /safari\//.test(s) && !/chrome/.test(s)
        ? "Safari"
        : /firefox\//.test(s)
          ? "Firefox"
          : undefined;
  const os = /iphone|ipad|ipod/.test(s)
    ? "iOS"
    : /android/.test(s)
      ? "Android"
      : /windows/.test(s)
        ? "Windows"
        : /mac os x|macos/.test(s)
          ? "macOS"
          : /linux/.test(s)
            ? "Linux"
            : undefined;
  return { device, browser, os };
}

/** Derive a traffic source when the client didn't send one. */
function deriveSource(referrer: string | null | undefined, explicit: string | null | undefined) {
  if (explicit) return explicit.toLowerCase();
  if (!referrer) return "direct";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (/google\./.test(host)) return "google";
    if (/bing\./.test(host)) return "bing";
    if (/facebook\.|fb\./.test(host)) return "facebook";
    if (/t\.co|twitter/.test(host)) return "twitter";
    return host || "direct";
  } catch {
    return "direct";
  }
}

function toRow(projectId: string, e: EventInput, ua: ReturnType<typeof parseUserAgent>) {
  const ts = e.timestamp ?? new Date();
  return {
    projectId,
    name: e.event,
    userId: e.userId,
    sessionId: e.sessionId,
    page: e.page ?? null,
    referrer: e.referrer ?? null,
    source: deriveSource(e.referrer, e.source),
    medium: e.medium ?? null,
    device: e.device ?? ua.device ?? null,
    browser: e.browser ?? ua.browser ?? null,
    os: e.os ?? ua.os ?? null,
    country: e.country ?? null,
    properties: (e.properties ?? undefined) as Prisma.InputJsonValue | undefined,
    timestamp: ts,
  };
}

/**
 * Persist a batch of events for a project, upsert session rows, invalidate
 * the analytics cache, and broadcast to realtime subscribers.
 */
export async function ingestEvents(
  apiKey: ApiKey,
  events: EventInput[],
  userAgent?: string
): Promise<{ accepted: number }> {
  const ua = parseUserAgent(userAgent);
  const rows = events.map((e) => toRow(apiKey.projectId, e, ua));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.event.createMany({ data: rows });

    for (const row of rows) {
      const isConversion = (CONVERSION_EVENTS as readonly string[]).includes(row.name);
      await tx.session.upsert({
        where: {
          projectId_sessionId: { projectId: row.projectId, sessionId: row.sessionId },
        },
        create: {
          projectId: row.projectId,
          sessionId: row.sessionId,
          userId: row.userId,
          startedAt: row.timestamp,
          lastEventAt: row.timestamp,
          eventCount: 1,
          page: row.page,
          device: row.device,
          browser: row.browser,
          os: row.os,
          country: row.country,
          source: row.source,
          converted: isConversion,
        },
        update: {
          lastEventAt: row.timestamp,
          eventCount: { increment: 1 },
          converted: isConversion ? true : undefined,
        },
      });
    }
  });

  await bumpProjectVersion(apiKey.projectId);

  // Fan out to realtime subscribers (after commit so listeners can re-query)
  for (const row of rows) {
    const payload: IngestedEventPayload = {
      projectId: row.projectId,
      id: `${row.sessionId}-${row.timestamp.getTime()}`,
      name: row.name,
      userId: row.userId,
      sessionId: row.sessionId,
      page: row.page,
      device: row.device,
      browser: row.browser,
      country: row.country,
      source: row.source,
      timestamp: (row.timestamp ?? now).toISOString(),
      properties: row.properties ?? null,
    };
    bus.emit(BUS_EVENT_INGESTED, payload);
  }

  return { accepted: rows.length };
}
