// Manual end-to-end check of the Python AI service (FR-4.3, FR-8.1, NFR-5).
//   1) npm run ai:dev                 (FastAPI + LangGraph on :8000, needs GEMINI_API_KEY + AI_SERVICE_TOKEN)
//   2) npx tsx --env-file=.env scripts/ai-smoke.mts
// With AI_SERVICE_URL unset it targets APP_URL/api/ai (e.g. the deployed site). No database access, no personal data.
import { AI_TIMEOUT_MS } from "../src/lib/rules";
import { requestAgenda, requestSummaryQuiz } from "../src/server/services/ai/ai-service-client";

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  console.log(`\n── ${label} (${Date.now() - started} ms, budget ${AI_TIMEOUT_MS} ms)`);
  return result;
}

const agenda = await timed("FR-4.3 agenda", () =>
  requestAgenda({
    durationMinutes: 60,
    skill: "بايثون",
    category: "البرمجة",
    goal: "أريد فهم الحلقات for و while وكتابة برنامج صغير",
    participantNames: [],
  }),
);
console.log(agenda ? JSON.stringify(agenda, null, 2) : "null → the app would use the FR-4.4 fallback agenda");

const summary = await timed("FR-8.1 summary + quiz", () =>
  requestSummaryQuiz({
    skill: "بايثون",
    category: "البرمجة",
    goal: "فهم الحلقات for و while",
    tickedTasks: ["شرح for مع range", "تمرين while مع شرط توقف"],
    notes: "for تمر على عناصر؛ while تتكرر حتى يصبح الشرط خاطئاً؛ break توقف الحلقة.",
    code: "for i in range(1, 11):\n    print(7 * i)",
    participantNames: [],
  }),
);
console.log(summary ? JSON.stringify(summary, null, 2) : "null → the app would follow FR-8.5 (notes and code only, release after 48h)");
process.exit(0);
