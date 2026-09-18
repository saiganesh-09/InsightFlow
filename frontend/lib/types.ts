export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ANALYST" | "USER";
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  websiteUrl: string | null;
  ownerId: string;
  isOwner?: boolean;
  createdAt: string;
  updatedAt: string;
  eventCount?: number;
  apiKeyPreview?: string | null;
}

export interface ApiKeyMasked {
  id: string;
  name: string;
  masked: string;
  prefix: string;
  status: "ACTIVE" | "REVOKED";
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface OverviewMetrics {
  events: number;
  users: number;
  sessions: number;
  conversions: number;
  conversionRate: number;
  avgSessionDurationSec: number;
  activeUsers5m: number;
  eventsPerSession: number;
  period: { from: string; to: string };
  previous?: { users: number; sessions: number; events: number; conversionRate: number };
}

export interface TimeseriesPoint {
  t: string;
  value: number;
}

export interface TopPage {
  page: string;
  views: number;
  users: number;
}

export interface TopEvent {
  name: string;
  count: number;
  users: number;
}

export interface TrafficSource {
  source: string;
  sessions: number;
  users: number;
  events: number;
}

export interface BreakdownValue {
  value: string;
  users: number;
  events: number;
  sessions: number;
}

export interface EventRow {
  id: string;
  name: string;
  userId: string;
  sessionId: string;
  page: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  source: string | null;
  referrer: string | null;
  timestamp: string;
  receivedAt: string;
  properties: Record<string, unknown> | null;
}

export interface RealtimeSummary {
  activeUsers: number;
  eventsLastHour: number;
  activePages: { page: string | null; count: number }[];
  recentEvents: EventRow[];
}

export interface LiveEvent {
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

export interface SegmentStats {
  users: number;
  newUsers: number;
  returningUsers: number;
  sessions: number;
  events: number;
  conversionRate: number;
  eventsPerUser: number;
}

export interface TopUser {
  userId: string;
  events: number;
  sessions: number;
  lastSeen: string;
  conversions: number;
}

export interface SessionRow {
  sessionId: string;
  userId: string;
  startedAt: string;
  lastEventAt: string;
  eventCount: number;
  converted: boolean;
  device: string | null;
  browser: string | null;
  country: string | null;
  source: string | null;
  durationSec: number;
}

export interface Funnel {
  id: string;
  name: string;
  windowDays: number;
  steps: { id: string; eventName: string; order: number }[];
  createdAt: string;
}

export interface FunnelResults {
  funnel: { id: string; name: string; windowDays: number };
  steps: {
    order: number;
    eventName: string;
    users: number;
    conversionFromStart: number;
    conversionFromPrevious: number;
    dropOff: number;
  }[];
  overallConversion: number;
  entered: number;
  completed: number;
}

export interface Anomaly {
  id: string;
  metric: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  direction: "spike" | "drop";
  baseline: number;
  observed: number;
  zScore: number;
  message: string;
  window: string;
  detectedAt: string;
}

export interface Insight {
  id: string;
  question: string;
  answer: string;
  model: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  type: "WEEKLY" | "MONTHLY";
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  periodStart: string;
  periodEnd: string;
  data?: ReportData;
  summary?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportData {
  period: { from: string; to: string };
  totals: {
    events: number;
    users: number;
    sessions: number;
    conversions: number;
    conversionRate: number;
    avgSessionDurationSec: number;
  };
  previousTotals: { users: number; sessions: number; events: number; conversionRate: number };
  growth: { usersPct: number | null; sessionsPct: number | null; eventsPct: number | null };
  topPages: TopPage[];
  topEvents: TopEvent[];
  trafficSources: TrafficSource[];
  dailyEvents: TimeseriesPoint[];
  anomalies: { severity: string; message: string; detectedAt: string }[];
}

export interface DateRange {
  from: string;
  to: string;
  label: string;
}
