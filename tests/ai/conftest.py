"""Shared fixtures for the Python AI service tests (no network, no Gemini)."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "api"))  # import _ai.* like api/ai.py does
sys.path.insert(0, ROOT)  # import api.ai

from _ai.llm import LLMReply, LLMUnavailable  # noqa: E402


@dataclass
class FakeLLM:
    """Answers with the given replies in order; a None reply means "model unavailable"."""

    replies: list[object]
    prompts: list[str] = field(default_factory=list)

    def generate_json(self, prompt: str, deadline: float) -> LLMReply:
        self.prompts.append(prompt)
        reply = self.replies[min(len(self.prompts), len(self.replies)) - 1]
        if reply is None:
            raise LLMUnavailable("fake outage")
        text = reply if isinstance(reply, str) else json.dumps(reply, ensure_ascii=False)
        return LLMReply(text=text, model="fake-model")


@pytest.fixture
def fake_llm():
    return FakeLLM


def agenda(*minutes_and_phases: tuple[int, str]) -> list[dict]:
    return [
        {"title": f"مهمة رقم {i}", "details": "تفاصيل", "phase": phase, "plannedMinutes": minutes}
        for i, (minutes, phase) in enumerate(minutes_and_phases, 1)
    ]


def summary_reply(questions: int = 3, broken_question: bool = False) -> dict:
    qs = [
        {"prompt": f"سؤال رقم {i}؟", "options": ["أ", "ب", "ج"], "correctOption": 1, "explanation": "لأن"}
        for i in range(1, questions + 1)
    ]
    if broken_question and qs:
        qs[0]["correctOption"] = 7
    return {
        "summary": "ملخص الجلسة عن الحلقات في بايثون",
        "keyPoints": ["for تمر على العناصر", "while تعتمد على شرط"],
        "exercises": [{"title": "جدول الضرب", "description": "اطبع جدول ضرب العدد 7"}],
        "questions": qs,
    }
