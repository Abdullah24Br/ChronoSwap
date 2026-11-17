"""FR-8.1 / FR-8.5 / Q-21: session summary, exercises and a 3-question quiz as a LangGraph.

    scrub ─► generate ─► validate ──valid──► finalize (AI) ─► END
                ▲           │
                └─ repair ◄─┤ invalid, tries left, time left
                            │
                            ├─ out of tries, summary valid ─► partial (summary, no quiz) ─► END
                            └─ out of tries, nothing usable ─► failed ─► END

Q-21: a valid summary is kept even when the quiz cannot be fixed; the app then follows FR-8.5
(release after 48h, no quiz). Only educational content is sent (FR-8.6).
"""

from __future__ import annotations

import json
import time
from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from .llm import JsonLLM, LLMUnavailable, log
from .privacy import scrub

QUIZ_QUESTIONS = 3
MAX_ATTEMPTS = 3
MAX_TEXT = 3000


class SummaryState(TypedDict, total=False):
    # input
    skill: str
    category: str
    goal: str
    ticked_tasks: list[str]
    notes: str
    code: str
    participant_names: list[str]
    deadline: float
    # working
    raw: str | None
    errors: list[str]
    attempts: int
    model: str | None
    # output
    summary: dict[str, Any] | None  # {summary, keyPoints, exercises}
    questions: list[dict[str, Any]] | None
    status: Literal["AI", "PARTIAL", "FAILED"]


def build_prompt(state: SummaryState) -> str:
    tasks = state.get("ticked_tasks") or []
    tasks_text = "\n".join(f"  {i}. {t}" for i, t in enumerate(tasks, 1)) or "  (لم تُؤشَّر مهام)"
    notes = (state.get("notes") or "").strip()[:MAX_TEXT] or "  (لا توجد ملاحظات)"
    code = (state.get("code") or "").strip()[:MAX_TEXT]
    code_text = f"```\n{code}\n```" if code else "  (لا يوجد كود)"
    category = f" ({state['category']})" if state.get("category") else ""
    prompt = f"""أنت خبير تعليمي في منصة ChronoSwap لتبادل المهارات.
حلّل مخرجات جلسة تعليمية منتهية وولّد:
1. ملخصاً عاماً (summary) ونقاطاً أساسية (keyPoints).
2. تمارين مقترحة (exercises) ليرسّخ المتعلم ما تعلّمه.
3. اختباراً من {QUIZ_QUESTIONS} أسئلة اختيار من متعدد (questions) مبنياً على ما شُرح فعلاً.

بيانات الجلسة:
- المهارة: {state['skill']}{category}
- الهدف: {state['goal']}
- المهام المنجزة:
{tasks_text}
- ملاحظات الشرح:
{notes}
- الكود المشترك:
{code_text}

القواعد:
1. {QUIZ_QUESTIONS} أسئلة بالضبط، لكل سؤال: prompt، options (3 أو 4 خيارات)، correctOption (فهرس الإجابة من 0)، explanation.
2. أخرج JSON فقط بهذا الشكل:
{{"summary": "...", "keyPoints": ["...", "..."], "exercises": [{{"title": "...", "description": "..."}}],
 "questions": [{{"prompt": "...", "options": ["...", "...", "..."], "correctOption": 0, "explanation": "..."}}]}}"""
    if state.get("errors"):
        prompt += (
            "\n\nمحاولتك السابقة غير صالحة لهذه الأسباب، صحّحها وأعد الرد كاملاً:\n- "
            + "\n- ".join(state["errors"])
            + f"\n\nالمحاولة السابقة:\n{state.get('raw') or ''}"
        )
    return prompt


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def validate_summary_part(data: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    summary = _text(data.get("summary"))
    if len(summary) < 10:
        errors.append("summary قصير جداً أو مفقود")
    points = data.get("keyPoints")
    if not isinstance(points, list) or not 2 <= len(points) <= 8 or not all(_text(p) for p in points):
        errors.append("keyPoints يجب أن تكون من 2 إلى 8 نقاط نصية")
    exercises = data.get("exercises")
    good_exercises = []
    if isinstance(exercises, list) and 1 <= len(exercises) <= 5:
        for ex in exercises:
            if isinstance(ex, dict) and len(_text(ex.get("title"))) >= 2 and len(_text(ex.get("description"))) >= 5:
                good_exercises.append({"title": _text(ex["title"]), "description": _text(ex["description"])})
    if not good_exercises or len(good_exercises) != len(exercises or []):
        errors.append("exercises يجب أن تكون من 1 إلى 5 عناصر لكل منها title وdescription")
    if errors:
        return None, errors
    return {"summary": summary, "keyPoints": [_text(p) for p in points], "exercises": good_exercises}, []


def validate_questions(data: dict[str, Any]) -> tuple[list[dict[str, Any]] | None, list[str]]:
    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) != QUIZ_QUESTIONS:
        return None, [f"questions يجب أن تحتوي {QUIZ_QUESTIONS} أسئلة بالضبط"]
    errors: list[str] = []
    out = []
    for i, q in enumerate(questions, 1):
        if not isinstance(q, dict):
            errors.append(f"السؤال {i} ليس كائناً")
            continue
        prompt = _text(q.get("prompt"))
        options = q.get("options")
        correct = q.get("correctOption")
        if len(prompt) < 5:
            errors.append(f"نص السؤال {i} قصير جداً")
        if not isinstance(options, list) or not 2 <= len(options) <= 6 or not all(_text(o) for o in options):
            errors.append(f"خيارات السؤال {i} يجب أن تكون من 2 إلى 6 نصوص")
            continue
        if not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct < len(options):
            errors.append(f"correctOption في السؤال {i} خارج حدود الخيارات")
            continue
        out.append({
            "prompt": prompt,
            "options": [_text(o) for o in options],
            "correctOption": correct,
            "explanation": _text(q.get("explanation")) or None,
        })
    return (None, errors) if errors else (out, [])


def build_summary_graph(llm: JsonLLM):
    def scrub_node(state: SummaryState) -> SummaryState:
        names = state.get("participant_names", [])
        return {
            "goal": scrub(state.get("goal", ""), names),
            "notes": scrub(state.get("notes", ""), names),
            "code": scrub(state.get("code", ""), names),
            "ticked_tasks": [scrub(t, names) for t in state.get("ticked_tasks", [])],
            "errors": [],
            "attempts": 0,
            "raw": None,
            "summary": None,
            "questions": None,
        }

    def generate_node(state: SummaryState) -> SummaryState:
        try:
            reply = llm.generate_json(build_prompt(state), state["deadline"])
        except LLMUnavailable as error:
            log.warning("[AI] model unavailable: %s", error)
            return {"raw": None, "attempts": MAX_ATTEMPTS, "errors": ["النموذج غير متاح"]}
        return {"raw": reply.text, "model": reply.model, "attempts": state.get("attempts", 0) + 1}

    def validate_node(state: SummaryState) -> SummaryState:
        raw = state.get("raw")
        if not raw:
            return {"errors": state.get("errors") or ["لم يصل رد"]}
        text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return {"errors": ["الرد ليس JSON صالحاً"]}
        if not isinstance(data, dict):
            return {"errors": ["الرد يجب أن يكون كائن JSON"]}
        summary, summary_errors = validate_summary_part(data)
        questions, question_errors = validate_questions(data)
        update: SummaryState = {"errors": summary_errors + question_errors}
        # Keep the best summary seen so far, even if this attempt's quiz is broken (Q-21).
        if summary:
            update["summary"] = summary
        if questions:
            update["questions"] = questions
        return update

    def route(state: SummaryState) -> str:
        if not state.get("errors") and state.get("summary") and state.get("questions"):
            return "finalize"
        log.warning("[AI] summary attempt %s rejected: %s", state.get("attempts", 0), "; ".join(state.get("errors") or [])[:300])
        enough_time = state["deadline"] - time.monotonic() > 4
        if state.get("attempts", 0) < MAX_ATTEMPTS and enough_time:
            return "repair"
        return "partial" if state.get("summary") else "failed"

    graph = StateGraph(SummaryState)
    graph.add_node("scrub", scrub_node)
    graph.add_node("generate", generate_node)
    graph.add_node("validate", validate_node)
    graph.add_node("finalize", lambda s: {"status": "AI"})
    graph.add_node("partial", lambda s: {"status": "PARTIAL", "questions": None})
    graph.add_node("failed", lambda s: {"status": "FAILED", "summary": None, "questions": None})
    graph.add_edge(START, "scrub")
    graph.add_edge("scrub", "generate")
    graph.add_edge("generate", "validate")
    graph.add_conditional_edges(
        "validate", route, {"finalize": "finalize", "repair": "generate", "partial": "partial", "failed": "failed"}
    )
    for node in ("finalize", "partial", "failed"):
        graph.add_edge(node, END)
    return graph.compile(name="summary_quiz")


def run_summary(llm: JsonLLM, *, skill: str, category: str, goal: str, ticked_tasks: list[str], notes: str,
                code: str, participant_names: list[str], budget_seconds: float = 25.0) -> SummaryState:
    graph = build_summary_graph(llm)
    return graph.invoke(
        {
            "skill": skill,
            "category": category,
            "goal": goal,
            "ticked_tasks": ticked_tasks,
            "notes": notes,
            "code": code,
            "participant_names": participant_names,
            "deadline": time.monotonic() + budget_seconds,
        }
    )
