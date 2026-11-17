"""The FastAPI endpoint: token check (fail closed), input validation, response shape (NFR-1)."""

from __future__ import annotations

import pytest
from conftest import FakeLLM, agenda, summary_reply
from fastapi.testclient import TestClient

import api.ai as service


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    return TestClient(service.app)


def use_llm(monkeypatch, replies):
    llm = FakeLLM(replies)
    monkeypatch.setattr(service, "make_llm", lambda: llm)
    return llm


AGENDA_BODY = {"task": "agenda", "input": {"durationMinutes": 60, "skill": "بايثون", "goal": "الحلقات"}}


def test_health_is_public(client):
    assert client.get("/api/ai").json()["ok"] is True


def test_rejects_missing_or_wrong_token(client, monkeypatch):
    use_llm(monkeypatch, [])
    assert client.post("/api/ai", json=AGENDA_BODY).status_code == 401
    assert client.post("/api/ai", json=AGENDA_BODY, headers={"x-ai-token": "nope"}).status_code == 401


def test_fails_closed_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("AI_SERVICE_TOKEN", raising=False)
    res = TestClient(service.app).post("/api/ai", json=AGENDA_BODY, headers={"x-ai-token": "anything"})
    assert res.status_code == 503


def test_rejects_invalid_input(client, monkeypatch):
    use_llm(monkeypatch, [])
    bad = {"task": "agenda", "input": {"durationMinutes": 5, "skill": "", "goal": "x"}}
    assert client.post("/api/ai", json=bad, headers={"x-ai-token": "test-token"}).status_code == 422


def test_agenda_round_trip(client, monkeypatch):
    use_llm(monkeypatch, [agenda((15, "THEORY"), (30, "PRACTICE"), (15, "REVIEW"))])
    res = client.post("/api/ai", json=AGENDA_BODY, headers={"x-ai-token": "test-token"}).json()
    assert res["source"] == "AI" and res["model"] == "fake-model"
    assert len(res["items"]) == 3


def test_summary_round_trip(client, monkeypatch):
    use_llm(monkeypatch, [summary_reply()])
    body = {"task": "summary_quiz", "input": {"skill": "بايثون", "goal": "الحلقات", "tickedTasks": ["شرح"]}}
    res = client.post("/api/ai", json=body, headers={"x-ai-token": "test-token"}).json()
    assert res["status"] == "AI"
    assert len(res["questions"]) == 3
