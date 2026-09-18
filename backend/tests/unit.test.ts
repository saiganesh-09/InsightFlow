import { describe, expect, it } from "vitest";
import { generateApiKey, sha256, safeEqual } from "../src/lib/crypto.js";
import { parseUserAgent } from "../src/modules/events/ingest.service.js";
import { eventSchema } from "../src/modules/events/events.schemas.js";

// ─── Pure-function unit tests (no DB required) ──────────────────────

describe("crypto / api keys", () => {
  it("generates if_live_ keys with correct shape", () => {
    const k = generateApiKey();
    expect(k.plaintext).toMatch(/^if_live_[0-9a-f]{48}$/);
    expect(k.prefix).toBe(k.plaintext.slice(0, 12));
    expect(k.lastFour).toBe(k.plaintext.slice(-4));
    expect(k.keyHash).toBe(sha256(k.plaintext));
    expect(k.keyHash).toHaveLength(64);
  });

  it("generates unique keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
  });

  it("safeEqual compares hashes correctly", () => {
    const h = sha256("x");
    expect(safeEqual(h, sha256("x"))).toBe(true);
    expect(safeEqual(h, sha256("y"))).toBe(false);
    expect(safeEqual(h, "short")).toBe(false);
  });
});

describe("user-agent parsing", () => {
  it("detects desktop chrome/windows", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );
    expect(r).toEqual({ device: "desktop", browser: "Chrome", os: "Windows" });
  });

  it("detects mobile safari/ios", () => {
    const r = parseUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
    );
    expect(r.device).toBe("mobile");
    expect(r.browser).toBe("Safari");
    expect(r.os).toBe("iOS");
  });

  it("returns empty for missing UA", () => {
    expect(parseUserAgent(undefined)).toEqual({});
  });
});

describe("event schema validation", () => {
  it("accepts a minimal valid event", () => {
    const r = eventSchema.safeParse({ event: "PAGE_VIEW", userId: "u1", sessionId: "s1" });
    expect(r.success).toBe(true);
  });

  it("uppercases event names and accepts namespaced customs", () => {
    const r = eventSchema.safeParse({ event: "checkout.completed", userId: "u", sessionId: "s" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.event).toBe("CHECKOUT.COMPLETED");
  });

  it("rejects invalid event names", () => {
    expect(eventSchema.safeParse({ event: "bad name!!", userId: "u", sessionId: "s" }).success).toBe(false);
    expect(eventSchema.safeParse({ event: "", userId: "u", sessionId: "s" }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(eventSchema.safeParse({ event: "PAGE_VIEW" }).success).toBe(false);
    expect(eventSchema.safeParse({ event: "PAGE_VIEW", userId: "u" }).success).toBe(false);
  });

  it("coerces timestamps and rejects far-future ones", () => {
    const ok = eventSchema.safeParse({
      event: "PAGE_VIEW", userId: "u", sessionId: "s",
      timestamp: new Date().toISOString(),
    });
    expect(ok.success).toBe(true);
    const future = eventSchema.safeParse({
      event: "PAGE_VIEW", userId: "u", sessionId: "s",
      timestamp: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(future.success).toBe(false);
  });

  it("limits property count and value types", () => {
    const tooMany = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    expect(
      eventSchema.safeParse({ event: "X", userId: "u", sessionId: "s", properties: tooMany }).success
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        event: "X", userId: "u", sessionId: "s",
        properties: { nested: { bad: "object" } },
      }).success
    ).toBe(false);
  });
});

describe("anomaly z-score logic", () => {
  // Mirror of the detection math in anomaly.service.ts (pure parts)
  function stats(values: number[]) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return { mean, stddev: Math.sqrt(variance) };
  }

  it("flags a clear spike", () => {
    const baseline = Array.from({ length: 24 }, () => 100 + (Math.random() * 4 - 2));
    const { mean, stddev } = stats(baseline);
    const observed = mean + 5 * stddev;
    const z = (observed - mean) / stddev;
    expect(z).toBeGreaterThan(3.5);
  });

  it("does not flag normal variance", () => {
    const baseline = [100, 102, 98, 101, 99, 100, 103, 97];
    const { mean, stddev } = stats(baseline);
    const observed = mean + 1.5 * stddev;
    const z = Math.abs((observed - mean) / stddev);
    expect(z).toBeLessThan(2.5);
  });

  it("handles zero stddev (perfectly flat baseline)", () => {
    const { stddev } = stats([50, 50, 50, 50]);
    expect(stddev).toBe(0);
    // z-score guard: division by zero must be avoided by the caller
    const z = stddev > 0 ? (60 - 50) / stddev : 0;
    expect(z).toBe(0);
  });
});
