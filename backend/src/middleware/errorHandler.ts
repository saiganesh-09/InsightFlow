import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { isProd } from "../config.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details: err.flatten() },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: { code: "CONFLICT", message: "A record with that value already exists" },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Record not found" },
      });
    }
  }

  // Body-parser JSON errors etc.
  if (err instanceof SyntaxError && "body" in (err as object)) {
    return res.status(400).json({
      error: { code: "BAD_JSON", message: "Malformed JSON body" },
    });
  }

  logger.error(`Unhandled error on ${req.method} ${req.path}: ${(err as Error)?.message}`, {
    stack: isProd ? undefined : (err as Error)?.stack,
  });
  res.status(500).json({
    error: { code: "INTERNAL", message: "Internal server error" },
  });
}
