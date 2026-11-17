"""FR-8.6 / Q-22: only educational content may reach the AI.

Participant names (sent by the app so they can be removed here) become neutral roles, and
e-mail addresses, phone numbers and links are masked. Runs as the first node of every graph.
"""

from __future__ import annotations

import re

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
URL = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
# 7+ digits, optionally with +, spaces, dashes or brackets in between (Syrian and international).
PHONE = re.compile(r"(?<![\w])\+?\d[\d\s\-()]{5,}\d(?![\w])")


def scrub(text: str, names: list[str] | None = None) -> str:
    if not text:
        return text
    out = EMAIL.sub("[بريد محذوف]", text)
    out = URL.sub("[رابط محذوف]", out)
    out = PHONE.sub("[رقم محذوف]", out)
    # Full names first, then their parts ("سارة الحلبي" and "سارة"), longest first.
    variants: set[str] = set()
    for name in names or []:
        name = (name or "").strip()
        if len(name) >= 2:
            variants.add(name)
            variants.update(part for part in name.split() if len(part) >= 3)
    for variant in sorted(variants, key=len, reverse=True):
        out = re.sub(re.escape(variant), "المشارك", out)
    return out
