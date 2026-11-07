import { AI_TIMEOUT_MS } from "@/lib/rules";
import { env } from "@/server/env";

export interface GenerateContentOptions {
  model?: string;
  timeoutMs?: number;
}

/**
 * Tried in order. When one is overloaded (429 / 5xx) the next one is used. Pinned versions get
 * retired by Google, so this list is overridable with GEMINI_MODEL (comma-separated).
 */
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

function modelsToTry(override: string | undefined, configured: string): string[] {
  if (override) return [override];
  const list = configured
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_MODELS;
}

/**
 * Calls Gemini API to generate structured content.
 * Returns null if GEMINI_API_KEY is not configured, or if every model fails or the time budget
 * runs out, enabling graceful fallback (FR-4.4 / FR-8.5). NFR-5: one budget of AI_TIMEOUT_MS
 * covers all attempts together.
 */
export async function callGemini(
  prompt: string,
  options: GenerateContentOptions = {},
): Promise<string | null> {
  const config = env();
  const apiKey = config.GEMINI_API_KEY?.trim();

  // If no API key configured, gracefully return null to trigger fallback
  if (!apiKey) {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const deadline = Date.now() + timeoutMs;
  const models = modelsToTry(options.model, config.GEMINI_MODEL);
  const attempts = [...models, ...models, ...models]; // up to 3 rounds while time remains

  try {
    for (const [i, model] of attempts.entries()) {
      // Between rounds, back off briefly (1s, then 2s) if the budget allows it.
      if (i > 0 && i % models.length === 0) {
        const pause = 1000 * (i / models.length);
        if (Date.now() + pause >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
      // NFR-1: the key travels in a header, never in the URL (URLs end up in logs and traces).
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return typeof text === "string" ? text.trim() : null;
      }

      console.warn(`[Gemini API] ${model} returned status ${res.status}`);
      const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
      if (!retryable) return null; // bad key or bad request: another model will not help
    }
    return null;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[Gemini API] Request timed out after ${timeoutMs}ms (NFR-5)`);
    } else {
      console.warn("[Gemini API] Request failed:", err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
