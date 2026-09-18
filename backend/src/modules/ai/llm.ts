import OpenAI from "openai";
import { config } from "../../config.js";
import { ApiError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

let client: OpenAI | null = null;

export function aiConfigured(): boolean {
  return Boolean(config.OPENAI_API_KEY);
}

function getClient(): OpenAI {
  if (!aiConfigured()) {
    throw new ApiError(
      503,
      "AI features are not configured — set OPENAI_API_KEY in the backend environment",
      "AI_NOT_CONFIGURED"
    );
  }
  client ??= new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
    timeout: 45_000,
    maxRetries: 1,
  });
  return client;
}

export async function chat(systemPrompt: string, userPrompt: string): Promise<string> {
  const openai = getClient();
  try {
    const res = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from model");
    return text;
  } catch (err) {
    logger.error(`LLM request failed: ${(err as Error).message}`);
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      502,
      `AI request failed: ${(err as Error).message}`,
      "AI_REQUEST_FAILED"
    );
  }
}
