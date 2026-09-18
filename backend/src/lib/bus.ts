import { EventEmitter } from "node:events";

/**
 * In-process event bus used to fan out freshly ingested events to the
 * Socket.IO gateway without coupling the ingestion module to the realtime
 * module. On a multi-instance deployment this would be swapped for a Redis
 * pub/sub channel — the interface stays the same.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const BUS_EVENT_INGESTED = "event:ingested";

export interface IngestedEventPayload {
  projectId: string;
  id: string;
  name: string;
  userId: string;
  sessionId: string;
  page: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  source: string | null;
  timestamp: string;
  properties: unknown;
}
