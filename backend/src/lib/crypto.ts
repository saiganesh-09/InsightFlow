import crypto from "node:crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Generate a project API key: `if_live_` + 32 hex chars of entropy. */
export function generateApiKey(): { plaintext: string; prefix: string; lastFour: string; keyHash: string } {
  const secret = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const plaintext = `if_live_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    lastFour: plaintext.slice(-4),
    keyHash: sha256(plaintext),
  };
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/** Constant-time-ish comparison helper for API key hashes. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
