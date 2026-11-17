"""ChronoSwap AI service: one Vercel Python function at /api/ai (FR-4.3, FR-8.1, NFR-1, NFR-5).

POST /api/ai  {"task": "agenda" | "summary_quiz", "input": {...}}
Header        x-ai-token: <AI_SERVICE_TOKEN>   (shared with the Next.js app; fail closed)

Local development:  python -m uvicorn api.ai:app --port 8000
"""

from __future__ import annotations

import hmac
import os
import sys
from typing import Annotated, Literal, Union

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

# Vercel runs this file directly; make the sibling helper package importable in both setups.
sys.path.insert(0, os.path.dirname(__file__))

from _ai.agenda_graph import run_agenda  # noqa: E402
from _ai.llm import GeminiLLM, JsonLLM  # noqa: E402
from _ai.summary_graph import run_summary  # noqa: E402

# NFR-5: the app gives up after 30 s; the graphs stop a little earlier so they can still answer.
BUDGET_SECONDS = 25.0

app = FastAPI(title="ChronoSwap AI", docs_url=None, redoc_url=None, openapi_url=None)


class AgendaInput(BaseModel):
    durationMinutes: int = Field(ge=15, le=240)
    skill: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=200)
    goal: str = Field(min_length=1, max_length=2000)
    participantNames: list[str] = Field(default_factory=list, max_length=4)


class SummaryInput(BaseModel):
    skill: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=200)
    goal: str = Field(min_length=1, max_length=2000)
    tickedTasks: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=20000)
    code: str = Field(default="", max_length=20000)
    participantNames: list[str] = Field(default_factory=list, max_length=4)


class AgendaRequest(BaseModel):
    task: Literal["agenda"]
    input: AgendaInput


class SummaryRequest(BaseModel):
    task: Literal["summary_quiz"]
    input: SummaryInput


AiRequest = Annotated[Union[AgendaRequest, SummaryRequest], Field(discriminator="task")]


def make_llm() -> JsonLLM:
    """Swapped out in tests."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not set")
    return GeminiLLM(api_key=key)


def check_token(token: str | None) -> None:
    expected = os.environ.get("AI_SERVICE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="AI_SERVICE_TOKEN is not set")
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/api/ai")
def health() -> dict:
    return {"ok": True, "service": "chronoswap-ai", "graphs": ["agenda", "summary_quiz"]}


@app.post("/api/ai")
def run_task(body: AiRequest, x_ai_token: Annotated[str | None, Header()] = None) -> dict:
    check_token(x_ai_token)
    llm = make_llm()

    if isinstance(body, AgendaRequest):
        i = body.input
        state = run_agenda(
            llm,
            duration_minutes=i.durationMinutes,
            skill=i.skill,
            category=i.category,
            goal=i.goal,
            participant_names=i.participantNames,
            budget_seconds=BUDGET_SECONDS,
        )
        return {
            "ok": True,
            "task": "agenda",
            "source": state["source"],
            "model": state.get("model") if state["source"] == "AI" else None,
            "attempts": state.get("attempts", 0),
            "items": state["items"],
        }

    i = body.input
    state = run_summary(
        llm,
        skill=i.skill,
        category=i.category,
        goal=i.goal,
        ticked_tasks=i.tickedTasks,
        notes=i.notes,
        code=i.code,
        participant_names=i.participantNames,
        budget_seconds=BUDGET_SECONDS,
    )
    return {
        "ok": True,
        "task": "summary_quiz",
        "status": state["status"],
        "model": state.get("model") if state["status"] != "FAILED" else None,
        "attempts": state.get("attempts", 0),
        "summary": state.get("summary"),
        "questions": state.get("questions"),
    }
