import type { NextFunction, Request, Response } from "express";

/**
 * Wrap an async route handler. The handler returns a JSON-serializable value
 * (sent with res.json), or undefined after writing the response itself / for
 * 204 no-content responses.
 */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fn(req, res);
      if (res.writableEnded) return;
      if (result === undefined) {
        if (res.statusCode === 204) return res.end();
        return res.json({ ok: true });
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
