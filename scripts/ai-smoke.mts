// Manual check that the configured Gemini key really answers (FR-4.3, FR-8.1, NFR-5).
//   npx tsx --env-file=.env scripts/ai-smoke.mts
// Sends one sample agenda request and one summary + quiz request. No database access, no personal data.
import { AI_TIMEOUT_MS } from "../src/lib/rules";
import { generateAiAgenda } from "../src/server/services/ai/agenda-service";
import { callGemini } from "../src/server/services/ai/gemini-client";
import { aiSummaryQuizSchema, buildSummaryQuizPrompt } from "../src/server/services/ai/summary-quiz-service";

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await run();
  console.log(`\n── ${label} (${Date.now() - started} ms, budget ${AI_TIMEOUT_MS} ms)`);
  return result;
}

const agenda = await timed("FR-4.3 agenda", () =>
  generateAiAgenda({
    durationMinutes: 60,
    skillNameAr: "بايثون",
    categoryNameAr: "البرمجة",
    goal: "أريد فهم الحلقات for و while وكتابة برنامج صغير",
  }),
);
console.log(agenda ? agenda : "null → the app would use the FR-4.4 fallback agenda");

const raw = await timed("FR-8.1 summary + quiz", () =>
  callGemini(
    buildSummaryQuizPrompt({
      skillName: "بايثون",
      categoryName: "البرمجة",
      goal: "فهم الحلقات for و while",
      tickedTasks: ["شرح for مع range", "تمرين while مع شرط توقف"],
      notes: "for تمر على عناصر؛ while تتكرر حتى يصبح الشرط خاطئاً؛ break توقف الحلقة.",
      code: "for i in range(1, 11):\n    print(7 * i)",
    }),
  ),
);
if (!raw) {
  console.log("null → the app would follow FR-8.5 (notes and code only, release after 48h)");
} else {
  const parsed = aiSummaryQuizSchema.safeParse(JSON.parse(raw));
  console.log(parsed.success ? JSON.stringify(parsed.data, null, 2) : parsed.error.issues);
}
process.exit(0);
