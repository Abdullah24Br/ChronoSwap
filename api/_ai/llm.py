"""Gemini access for the graphs (FR-4.3, FR-8.1, NFR-5).

One small interface, `JsonLLM`, so the graphs can be tested with a fake model. The real client
tries a list of models in order (pinned versions get retired, big models are often overloaded)
and never runs past the request's deadline.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Protocol

# Tried in order when one is overloaded (429 / 5xx) or retired (404). Override with GEMINI_MODEL
# (comma-separated) without touching the code. The "-latest" aliases follow Google's current models,
# so the list keeps working when pinned versions are retired.
DEFAULT_MODELS = ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-flash-lite-latest")

# One overloaded model can hang for 10+ s before answering 503; cap each call so the others still
# get a turn inside the request budget (NFR-5). Gemini rejects a deadline under 10 s with
# 400 INVALID_ARGUMENT, so no call is ever sent with less than MIN_CALL_SECONDS.
PER_CALL_SECONDS = 12.0
MIN_CALL_SECONDS = 10.0

log = logging.getLogger("chronoswap.ai")


class LLMUnavailable(Exception):
    """No model answered before the deadline. The graph then takes its fallback path."""


@dataclass(frozen=True)
class LLMReply:
    text: str
    model: str


class JsonLLM(Protocol):
    def generate_json(self, prompt: str, deadline: float) -> LLMReply:
        """Return the model's JSON text, or raise LLMUnavailable. `deadline` is time.monotonic()."""
        ...


def configured_models() -> tuple[str, ...]:
    raw = os.environ.get("GEMINI_MODEL", "")
    models = tuple(m.strip() for m in raw.split(",") if m.strip())
    return models or DEFAULT_MODELS


class GeminiLLM:
    """google-genai client. The API key comes from GEMINI_API_KEY and travels in a header."""

    RETRYABLE = {404, 408, 429, 500, 502, 503, 504}

    def __init__(self, api_key: str, models: tuple[str, ...] | None = None) -> None:
        from google import genai  # imported lazily so tests never need the SDK configured

        self._genai = genai
        self._client = genai.Client(api_key=api_key)
        self._models = models or configured_models()

    def generate_json(self, prompt: str, deadline: float) -> LLMReply:
        from google.genai import errors, types

        last_error: Exception | None = None
        # Up to three rounds over the model list, with a short pause between rounds.
        for round_no in range(3):
            if round_no > 0:
                pause = float(round_no)
                if time.monotonic() + pause >= deadline:
                    break
                time.sleep(pause)
            for model in self._models:
                remaining_ms = int((deadline - time.monotonic()) * 1000)
                if remaining_ms < MIN_CALL_SECONDS * 1000:
                    raise LLMUnavailable("deadline reached") from last_error
                call_ms = min(remaining_ms, int(PER_CALL_SECONDS * 1000))
                try:
                    response = self._client.models.generate_content(
                        model=model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            temperature=0.2,
                            response_mime_type="application/json",
                            http_options=types.HttpOptions(timeout=call_ms),
                            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                        ),
                    )
                except errors.APIError as error:
                    last_error = error
                    log.warning("[AI] %s answered %s: %s", model, getattr(error, "code", "?"), str(error)[:300])
                    if getattr(error, "code", None) in self.RETRYABLE:
                        continue  # next model
                    raise LLMUnavailable(f"{model}: {error}") from error
                except Exception as error:  # network errors, timeouts
                    last_error = error
                    log.warning("[AI] %s failed: %s: %s", model, type(error).__name__, str(error)[:300])
                    continue
                text = (response.text or "").strip()
                if text:
                    return LLMReply(text=text, model=model)
        raise LLMUnavailable("no model answered") from last_error
