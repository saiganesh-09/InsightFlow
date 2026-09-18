import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDelta(curr: number, prev: number | undefined): { text: string; positive: boolean | null } {
  if (prev === undefined) return { text: "—", positive: null };
  if (prev === 0) return { text: curr > 0 ? "+100%" : "0%", positive: curr > 0 };
  const d = ((curr - prev) / prev) * 100;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d >= 0 };
}

/** Preset date ranges for the dashboard picker. */
export function dateRangePreset(key: string): { from: string; to: string; label: string } {
  const now = new Date();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (key) {
    case "today":
      return { from: startOfDay(now).toISOString(), to: now.toISOString(), label: "Today" };
    case "yesterday": {
      const y = new Date(now.getTime() - 86400_000);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString(), label: "Yesterday" };
    }
    case "7d":
      return { from: new Date(now.getTime() - 7 * 86400_000).toISOString(), to: now.toISOString(), label: "Last 7 days" };
    case "30d":
      return { from: new Date(now.getTime() - 30 * 86400_000).toISOString(), to: now.toISOString(), label: "Last 30 days" };
    default:
      return { from: new Date(now.getTime() - 7 * 86400_000).toISOString(), to: now.toISOString(), label: "Last 7 days" };
  }
}
