import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/errors.js";

/** Common date-range + dimension filters shared by analytics endpoints. */
export const rangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  country: z.string().max(60).optional(),
  device: z.enum(["desktop", "mobile", "tablet"]).optional(),
  browser: z.string().max(60).optional(),
  os: z.string().max(60).optional(),
  source: z.string().max(120).optional(),
});

export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export interface ResolvedRange {
  from: Date;
  to: Date;
}

/** Default window: last 30 days. Clamps absurd ranges. */
export function resolveRange(q: RangeQuery): ResolvedRange {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86400_000);
  if (from > to) throw ApiError.badRequest("`from` must be before `to`");
  const maxSpan = 366 * 86400_000;
  if (to.getTime() - from.getTime() > maxSpan) {
    throw ApiError.badRequest("Date range too large (max 366 days)");
  }
  return { from, to };
}

/**
 * Build a composable WHERE fragment for the Event table.
 * Only ever interpolates *values* — column names are fixed identifiers —
 * so this is injection-safe.
 */
export function eventWhere(
  projectId: string,
  q: RangeQuery,
  r: ResolvedRange,
  alias = ""
): Prisma.Sql {
  const col = (name: string) => Prisma.raw(alias ? `${alias}."${name}"` : `"${name}"`);
  const clauses: Prisma.Sql[] = [
    Prisma.sql`${col("projectId")} = ${projectId}`,
    Prisma.sql`${col("timestamp")} >= ${r.from}`,
    Prisma.sql`${col("timestamp")} <= ${r.to}`,
  ];
  if (q.country) clauses.push(Prisma.sql`${col("country")} = ${q.country}`);
  if (q.device) clauses.push(Prisma.sql`${col("device")} = ${q.device}`);
  if (q.browser) clauses.push(Prisma.sql`${col("browser")} = ${q.browser}`);
  if (q.os) clauses.push(Prisma.sql`${col("os")} = ${q.os}`);
  if (q.source) clauses.push(Prisma.sql`${col("source")} = ${q.source}`);
  return Prisma.sql`(${Prisma.join(clauses, " AND ")})`;
}

export function sessionWhere(projectId: string, q: RangeQuery, r: ResolvedRange): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`"projectId" = ${projectId}`,
    Prisma.sql`"startedAt" >= ${r.from}`,
    Prisma.sql`"startedAt" <= ${r.to}`,
  ];
  if (q.country) clauses.push(Prisma.sql`"country" = ${q.country}`);
  if (q.device) clauses.push(Prisma.sql`"device" = ${q.device}`);
  if (q.browser) clauses.push(Prisma.sql`"browser" = ${q.browser}`);
  if (q.os) clauses.push(Prisma.sql`"os" = ${q.os}`);
  if (q.source) clauses.push(Prisma.sql`"source" = ${q.source}`);
  return Prisma.sql`(${Prisma.join(clauses, " AND ")})`;
}
