import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  ALLOW_NO_REDIS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:4000"),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  RATE_LIMIT_INGEST_PER_MINUTE: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(20),

  SEED_ADMIN_EMAIL: z.string().email().default("admin@insightflow.dev"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("Admin123!"),
  SEED_DEMO_EMAIL: z.string().email().default("demo@insightflow.dev"),
  SEED_DEMO_PASSWORD: z.string().min(8).default("Demo123!"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";
