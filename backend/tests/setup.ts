// Test environment defaults — set BEFORE any src/ imports so config.ts
// parses successfully. Uses .env / .env.test when present; falls back to
// safe local defaults so unit tests run with zero infrastructure.
import "dotenv/config";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-secret-test-secret-test-secret";
process.env.DATABASE_URL ||=
  "postgresql://insightflow:insightflow@localhost:5432/insightflow_test";
// Tests must never depend on Redis being up
process.env.ALLOW_NO_REDIS = "true";
process.env.OPENAI_API_KEY ||= "";
