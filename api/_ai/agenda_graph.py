"""FR-4.3 / FR-4.4: the smart agenda as a LangGraph.

    scrub ─► generate ─► validate ──valid──► finalize ─► END
                ▲           │
                └─ repair ◄─┤ invalid, tries left, time left
                            │
                            └─ out of tries / time / model down ─► fallback (25/50/25) ─► END

`repair` is the point of using a graph: instead of throwing away a near-miss (wrong total,
missing phase), the validation errors are sent back to the model to fix.
"""

from __future__ import annotations

import json
import time
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from .llm import JsonLLM, LLMUnavailable
from .privacy import scrub

PHASES = ("THEORY", "PRACTICE", "REVIEW")
MAX_ATTEMPTS = 3  # first try + two repairs


class AgendaItem(TypedDict, total=False):
    title: str
    details: str
    phase: Literal["THEORY", "PRACTICE", "REVIEW"]
    plannedMinutes: int


class AgendaState(TypedDict, total=False):
    # input
    duration_minutes: int
    skill: str
    category: str
    goal: str
    participant_names: list[str]
    deadline: float  # time.monotonic()
    # working
    raw: str | None
    errors: list[str]
    attempts: int
    model: str | None
    # output
    items: list[AgendaItem]
    source: Literal["AI", "FALLBACK"]


def fallback_items(duration: int, skill: str, goal: str) -> list[AgendaItem]:
    """FR-4.4: 25% theory, 50% practice, 25% review; the minutes always add up exactly."""
    theory = round(duration * 0.25)
    practice = round(duration * 0.5)
    review = duration - theory - practice
    return [
        {
            "title": f"المفاهيم والأسس النظرية: {skill}",
            "details": f"استعراض المفاهيم والمبادئ الأساسية المتعلقة بالهدف التعليمي: {goal}",
            "phase": "THEORY",
            "plannedMinutes": theory,
        },
        {
            "title": "التطبيق العملي والتدريب التفاعلي المباشر",
            "details": "تطبيق خطوة بخطوة مع حل أمثلة عملية وكتابة الأكواد ومراجعتها مع المدرّس",
            "phase": "PRACTICE",
            "plannedMinutes": practice,
        },
        {
            "title": "المراجعة الشاملة، الإجابة عن الأسئلة، والتقييم",
            "details": "مراجعة مخرجات الجلسة، حل أي صعوبات أو استفسارات، وتلخيص ما تم إنجازه",
            "phase": "REVIEW",
            "plannedMinutes": review,
        },
    ]


def build_prompt(state: AgendaState) -> str:
    duration = state["duration_minutes"]
    category = f" (التصنيف: {state['category']})" if state.get("category") else ""
    prompt = f"""أنت خبير تربوي وتقني لتخطيط الجلسات التعليمية التفاعلية على منصة ChronoSwap.
المهمة: ولّد أجندة تعليمية مقسمة لمهام فرعية محددة المدة بالدقائق تناسب بدقة المدة المحجوزة للجلسة.

معلومات الجلسة (محتوى تعليمي فقط):
- المهارة: {state['skill']}{category}
- هدف المتعلم: {state['goal']}
- إجمالي مدة الجلسة: {duration} دقيقة

شروط الإخراج الصارمة:
1. مجموع plannedMinutes لكل المهام يساوي بالضبط {duration} دقيقة.
2. عدد المهام بين 3 و5.
3. المراحل (phase) تغطي الأنواع الثلاثة: "THEORY" للمفاهيم، "PRACTICE" للتطبيق، "REVIEW" للمراجعة.
4. الصياغة بالعربية الواضحة.
5. أخرج JSON Array فقط بهذا الشكل:
[{{"title": "عنوان المهمة", "details": "ما سيُنجز", "phase": "THEORY", "plannedMinutes": 15}}]"""
    if state.get("errors"):
        prompt += (
            "\n\nمحاولتك السابقة كانت غير صالحة لهذه الأسباب، صحّحها وأعد الأجندة كاملة:\n- "
            + "\n- ".join(state["errors"])
            + f"\n\nالمحاولة السابقة:\n{state.get('raw') or ''}"
        )
    return prompt


def validate_items(raw: str | None, duration: int) -> tuple[list[AgendaItem] | None, list[str]]:
    """Returns (items, errors). A total that is off by a little is corrected on the last task."""
    if not raw:
        return None, ["لم يصل رد"]
    text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, ["الرد ليس JSON صالحاً"]
    if not isinstance(data, list) or not 2 <= len(data) <= 8:
        return None, ["يجب أن يكون الرد مصفوفة من 3 إلى 5 مهام"]

    errors: list[str] = []
    items: list[AgendaItem] = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            errors.append(f"المهمة {i} ليست كائناً")
            continue
        title = str(item.get("title", "")).strip()
        phase = item.get("phase")
        minutes = item.get("plannedMinutes")
        if not 3 <= len(title) <= 200:
            errors.append(f"عنوان المهمة {i} قصير أو طويل جداً")
        if phase not in PHASES:
            errors.append(f"phase في المهمة {i} يجب أن تكون THEORY أو PRACTICE أو REVIEW")
        if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes <= 0:
            errors.append(f"plannedMinutes في المهمة {i} يجب أن يكون عدداً صحيحاً موجباً")
        details = str(item.get("details", "")).strip()[:1000]
        items.append({"title": title, "details": details, "phase": phase, "plannedMinutes": minutes})  # type: ignore[typeddict-item]
    if errors:
        return None, errors

    missing = [p for p in PHASES if p not in {it["phase"] for it in items}]
    if missing:
        errors.append("المراحل الناقصة: " + "، ".join(missing))

    total = sum(it["plannedMinutes"] for it in items)
    diff = duration - total
    if diff != 0:
        # Small drift (e.g. 58 instead of 60) is fixed here; a real mismatch goes back to the model.
        if abs(diff) <= max(5, duration // 10) and items[-1]["plannedMinutes"] + diff > 0:
            items[-1]["plannedMinutes"] += diff
        else:
            errors.append(f"مجموع الدقائق {total} لا يساوي مدة الجلسة {duration}")
    return (None, errors) if errors else (items, [])


def build_agenda_graph(llm: JsonLLM):
    def scrub_node(state: AgendaState) -> AgendaState:
        names = state.get("participant_names", [])
        return {"goal": scrub(state["goal"], names), "errors": [], "attempts": 0, "raw": None}

    def generate_node(state: AgendaState) -> AgendaState:
        try:
            reply = llm.generate_json(build_prompt(state), state["deadline"])
        except LLMUnavailable:
            return {"raw": None, "attempts": MAX_ATTEMPTS, "errors": ["النموذج غير متاح"]}
        return {"raw": reply.text, "model": reply.model, "attempts": state.get("attempts", 0) + 1}

    def validate_node(state: AgendaState) -> AgendaState:
        items, errors = validate_items(state.get("raw"), state["duration_minutes"])
        return {"items": items or [], "errors": errors}

    def route(state: AgendaState) -> str:
        if not state.get("errors"):
            return "finalize"
        enough_time = state["deadline"] - time.monotonic() > 4
        if state.get("attempts", 0) < MAX_ATTEMPTS and enough_time:
            return "repair"
        return "fallback"

    def finalize_node(state: AgendaState) -> AgendaState:
        return {"source": "AI"}

    def fallback_node(state: AgendaState) -> AgendaState:
        return {
            "items": fallback_items(state["duration_minutes"], state["skill"], state["goal"]),
            "source": "FALLBACK",
        }

    graph = StateGraph(AgendaState)
    graph.add_node("scrub", scrub_node)
    graph.add_node("generate", generate_node)
    graph.add_node("validate", validate_node)
    graph.add_node("finalize", finalize_node)
    graph.add_node("fallback", fallback_node)
    graph.add_edge(START, "scrub")
    graph.add_edge("scrub", "generate")
    graph.add_edge("generate", "validate")
    # "repair" re-enters generate, which then sees the validation errors in its prompt.
    graph.add_conditional_edges("validate", route, {"finalize": "finalize", "repair": "generate", "fallback": "fallback"})
    graph.add_edge("finalize", END)
    graph.add_edge("fallback", END)
    return graph.compile(name="agenda")


def run_agenda(llm: JsonLLM, *, duration_minutes: int, skill: str, category: str, goal: str,
               participant_names: list[str], budget_seconds: float = 25.0) -> AgendaState:
    graph = build_agenda_graph(llm)
    return graph.invoke(
        {
            "duration_minutes": duration_minutes,
            "skill": skill,
            "category": category,
            "goal": goal,
            "participant_names": participant_names,
            "deadline": time.monotonic() + budget_seconds,
        }
    )
