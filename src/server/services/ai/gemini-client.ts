import { AI_TIMEOUT_MS } from "@/lib/rules";
import { env } from "@/server/env";

export interface GenerateContentOptions {
  model?: string;
  timeoutMs?: number;
}

/**
 * Calls Gemini API to generate structured content.
 * Returns null if GEMINI_API_KEY is not configured, or if the call times out or fails,
 * enabling seamless, graceful fallback to default algorithms (FR-4.4 / FR-8.5 / NFR-5).
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

  const model = options.model || config.GEMINI_MODEL || "gemini-2.5-flash";
  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[Gemini API] Request returned status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text.trim() : null;
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

