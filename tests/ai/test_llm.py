"""GeminiLLM model fallback and per-call cap (NFR-5), with a fake google-genai client (no network)."""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest
from google.genai import errors

from _ai import llm as llm_module
from _ai.llm import GeminiLLM, LLMUnavailable


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = outcomes  # model -> exception or text
        self.calls: list[tuple[str, int]] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append((model, config.http_options.timeout))
        outcome = self.outcomes[model]
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome)


def make(models, outcomes):
    client = GeminiLLM.__new__(GeminiLLM)
    client._models = models
    client._client = SimpleNamespace(models=FakeModels(outcomes))
    return client


def overloaded():
    return errors.ServerError(503, {"error": {"code": 503, "message": "overloaded", "status": "UNAVAILABLE"}})


def test_overloaded_model_gives_way_to_the_next():
    client = make(("big", "lite"), {"big": overloaded(), "lite": '{"ok": true}'})
    reply = client.generate_json("p", time.monotonic() + 25)
    assert reply.model == "lite"
    assert [m for m, _ in client._client.models.calls] == ["big", "lite"]


def test_each_call_is_capped_so_others_get_a_turn():
    client = make(("big",), {"big": '{"ok": true}'})
    client.generate_json("p", time.monotonic() + 25)
    assert client._client.models.calls[0][1] <= llm_module.PER_CALL_SECONDS * 1000


def test_bad_key_stops_at_once(monkeypatch):
    bad_key = errors.ClientError(400, {"error": {"code": 400, "message": "API key not valid", "status": "INVALID_ARGUMENT"}})
    client = make(("big", "lite"), {"big": bad_key, "lite": '{"ok": true}'})
    with pytest.raises(LLMUnavailable):
        client.generate_json("p", time.monotonic() + 25)
    assert len(client._client.models.calls) == 1
