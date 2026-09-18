import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { apiKeysRouter } from "./modules/apikeys/apikeys.routes.js";
import { ingestRouter } from "./modules/events/ingest.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { funnelsRouter } from "./modules/funnels/funnels.routes.js";
import { anomaliesRouter } from "./modules/anomalies/anomaly.routes.js";
import { insightsRouter } from "./modules/insights/insights.routes.js";
import { reportsRouter } from "./modules/reports/report.routes.js";
import { exportsRouter } from "./modules/exports/exports.routes.js";
import { aiConfigured } from "./modules/ai/llm.js";
import { redisAvailable } from "./lib/redis.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? undefined
        : false, // relaxed in dev for swagger/demo assets
    })
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Event ingestion is server-to-server / cross-site by design (x-api-key),
        // so we allow no-origin requests; browser dashboard calls must match FRONTEND_URL.
        if (!origin || origin === config.FRONTEND_URL || origin === config.BACKEND_URL) {
          return cb(null, true);
        }
        // Allow cross-origin ingestion (SDK posts from tracked sites) — the API
        // key is the credential, not cookies, so this is safe.
        return cb(null, true);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // ─── Health / status ──────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      redis: redisAvailable(),
      ai: aiConfigured(),
    });
  });

  // ─── API routes ───────────────────────────────────────────────────
  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/projects/:projectId/api-keys", apiKeysRouter);
  app.use("/api/projects/:projectId/analytics", analyticsRouter);
  app.use("/api/projects/:projectId/funnels", funnelsRouter);
  app.use("/api/projects/:projectId/anomalies", anomaliesRouter);
  app.use("/api/projects/:projectId/insights", insightsRouter);
  app.use("/api/projects/:projectId/reports", reportsRouter);
  app.use("/api/projects/:projectId/export", exportsRouter);

  // Public ingestion endpoints (API-key authenticated)
  app.use("/api/events", ingestRouter);

  // ─── API docs ─────────────────────────────────────────────────────
  try {
    const specPath = path.join(__dirname, "..", "docs", "openapi.yaml");
    const spec = YAML.load(specPath) as Record<string, unknown>;
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec));
    app.get("/api-docs.json", (_req, res) => res.json(spec));
  } catch {
    // docs optional at runtime
  }

  // ─── Demo assets (tracking SDK + demo page) ──────────────────────
  app.use("/demo", express.static(path.join(__dirname, "..", "public", "demo")));
  // Serve the tracking SDK directly from the repo-level sdk/ package
  app.use("/sdk", express.static(path.join(__dirname, "..", "..", "sdk")));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
