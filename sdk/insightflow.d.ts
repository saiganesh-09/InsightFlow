export interface InsightFlowConfig {
  /** Project API key — `if_live_…` */
  apiKey: string;
  /** Backend base URL, e.g. http://localhost:4000 */
  endpoint?: string;
  /** Stable user id; an anonymous id is generated + persisted otherwise */
  userId?: string;
  /** Override the auto-managed session id */
  sessionId?: string;
}

export interface InsightFlowEventProps {
  page?: string;
  referrer?: string;
  source?: string;
  device?: "desktop" | "mobile" | "tablet";
  userId?: string;
  sessionId?: string;
  properties?: Record<string, string | number | boolean | null>;
  [key: string]: unknown;
}

export interface InsightFlowClient {
  init(config: InsightFlowConfig): InsightFlowClient;
  track(event: string, props?: InsightFlowEventProps): void;
  page(page?: string): void;
  identify(userId: string): void;
  flush(): void;
}

declare const InsightFlow: InsightFlowClient;
export default InsightFlow;
