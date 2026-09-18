import { z } from "zod";

export const STANDARD_EVENTS = [
  "PAGE_VIEW",
  "BUTTON_CLICK",
  "SIGNUP",
  "LOGIN",
  "SEARCH",
  "PRODUCT_VIEW",
  "ADD_TO_CART",
  "CHECKOUT",
  "PURCHASE",
  "PAYMENT_FAILED",
  "VIDEO_PLAY",
] as const;

/** Events counted as "conversions" in funnel/rate calculations. */
export const CONVERSION_EVENTS = ["PURCHASE", "SIGNUP", "CHECKOUT"] as const;

const eventName = z
  .string()
  .min(1)
  .max(64)
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9_]+([.:][A-Z0-9_:-]+)?$/, "Event name must be UPPER_SNAKE or namespaced")
  );

const properties = z
  .record(z.string().max(64), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .refine((o) => Object.keys(o).length <= 50, { message: "Too many properties (max 50)" })
  .optional();

export const eventSchema = z.object({
  event: eventName,
  userId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  page: z.string().max(500).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  medium: z.string().max(120).optional().nullable(),
  device: z.enum(["desktop", "mobile", "tablet"]).optional().nullable(),
  browser: z.string().max(60).optional().nullable(),
  os: z.string().max(60).optional().nullable(),
  country: z.string().max(60).optional().nullable(),
  properties,
  timestamp: z
    .union([z.string().datetime({ offset: true }), z.number().int().positive()])
    .transform((v) => new Date(v))
    .refine((d) => !Number.isNaN(d.getTime()), { message: "Invalid timestamp" })
    .refine(
      (d) => d.getTime() <= Date.now() + 5 * 60_000,
      { message: "Timestamp too far in the future" }
    )
    .optional(),
});

export const batchEventSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

export type EventInput = z.infer<typeof eventSchema>;
