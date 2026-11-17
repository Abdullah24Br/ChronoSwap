import { AI_TIMEOUT_MS } from "@/lib/rules";
import { env } from "@/server/env";

/**
 * Client for the Python AI service (api/ai.py: FastAPI + LangGraph + Gemini).
 * FR-4.3 / FR-8.1 run there; this side only sends educational content plus the participants'
 * names (so the service can strip them before Gemini, FR-8.6 / Q-22), and keeps NFR-5's 30 s cap.
 * Every failure returns null: callers then take the FR-4.4 / FR-8.5 fallback paths.
 */

export interface AgendaRequest {
  durationMinutes: number;
  skill: string;
  category: string;
  goal: string;
  participantNames: string[];
}

export interface AgendaResult {
  source: "AI" | "FALLBACK";
  model: string | null;
  attempts: number;
  items: unknown;
}

export interface SummaryQuizRequest {
  skill: string;
  category: string;
  goal: string;
  tickedTasks: string[];
  notes: string;
  code: string;
  participantNames: string[];
}

/** Flattened answer of the summary graph. `questions` is null when the quiz could not be made (Q-21). */
export interface SummaryQuizResult {
  status: "AI" | "PARTIAL" | "FAILED";
  model: string | null;
  summary?: unknown;
  keyPoints?: unknown;
  exercises?: unknown;
  questions?: unknown;
}

/**
 * Where the service lives. On Vercel it is a function of the same deployment: production uses the
 * public domain; previews call their own deployment URL with the protection-bypass header (when
 * "Protection Bypass for Automation" is enabled). Locally: AI_SERVICE_URL=http://127.0.0.1:8000/api/ai
 */
function serviceUrl(): string {
  const config = env();
  if (config.AI_SERVICE_URL) return config.AI_SERVICE_URL;
  if (process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/ai`;
  }
  return `${config.APP_URL}/api/ai`;
}

async function post(task: "agenda" | "summary_quiz", input: object): Promise<Record<string, unknown> | null> {
  const token = env().AI_SERVICE_TOKEN;
  if (!token) {
    console.warn("[AI] AI_SERVICE_TOKEN is not set: using the fallback path");
    return null;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-ai-token": token };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(serviceUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ task, input }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[AI] service returned ${res.status} for ${task}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.warn(timedOut ? `[AI] ${task} timed out after ${AI_TIMEOUT_MS}ms (NFR-5)` : `[AI] ${task} failed`, timedOut ? "" : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** FR-4.3: agenda from the LangGraph agenda graph. */
export async function requestAgenda(input: AgendaRequest): Promise<AgendaResult | null> {
  const res = await post("agenda", input);
  if (!res || (res.source !== "AI" && res.source !== "FALLBACK")) return null;
  if (res.source === "FALLBACK") console.warn(`[AI] agenda graph fell back after ${res.attempts} attempt(s)`);
  return {
    source: res.source,
    model: typeof res.model === "string" ? res.model : null,
    attempts: typeof res.attempts === "number" ? res.attempts : 0,
    items: res.items,
  };
}

/** FR-8.1: summary, exercises and quiz from the LangGraph summary graph. */
export async function requestSummaryQuiz(input: SummaryQuizRequest): Promise<SummaryQuizResult | null> {
  const res = await post("summary_quiz", input);
  if (!res || (res.status !== "AI" && res.status !== "PARTIAL" && res.status !== "FAILED")) return null;
  if (res.status !== "AI") console.warn(`[AI] summary graph ended ${res.status} after ${res.attempts} attempt(s)`);
  const summary = (res.summary ?? null) as Record<string, unknown> | null;
  return {
    status: res.status,
    model: typeof res.model === "string" ? res.model : null,
    summary: summary?.summary,
    keyPoints: summary?.keyPoints,
    exercises: summary?.exercises,
    questions: res.questions ?? null,
  };
}
