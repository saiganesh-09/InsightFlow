import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../lib/errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validatedQuery?: unknown;
    }
  }
}

/** Validate req.body against a zod schema; replaces body with parsed data. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(
        new ApiError(400, "Validation failed", "VALIDATION_ERROR", result.error.flatten())
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(
        new ApiError(400, "Invalid query parameters", "VALIDATION_ERROR", result.error.flatten())
      );
    }
    req.validatedQuery = result.data;
    next();
  };
}
