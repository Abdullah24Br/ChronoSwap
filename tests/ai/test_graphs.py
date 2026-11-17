"""LangGraph behaviour: happy path, repair loop, fallback, partial result, privacy (FR-4.3/4.4, FR-8.1/8.5/8.6)."""

from __future__ import annotations

from conftest import agenda, summary_reply

from _ai.agenda_graph import run_agenda
from _ai.privacy import scrub
from _ai.summary_graph import run_summary

AGENDA_ARGS = dict(duration_minutes=60, skill="بايثون", category="البرمجة", goal="أفهم الحلقات", participant_names=[])
SUMMARY_ARGS = dict(skill="بايثون", category="البرمجة", goal="الحلقات", ticked_tasks=["شرح for"], notes="", code="",
                    participant_names=[])


# ── Agenda (FR-4.3 / FR-4.4) ─────────────────────────────────────────────────────────────────

def test_agenda_valid_first_try(fake_llm):
    llm = fake_llm([agenda((15, "THEORY"), (35, "PRACTICE"), (10, "REVIEW"))])
    state = run_agenda(llm, **AGENDA_ARGS)
    assert state["source"] == "AI"
    assert state["attempts"] == 1
    assert sum(i["plannedMinutes"] for i in state["items"]) == 60


def test_agenda_repairs_a_wrong_total_by_sending_the_error_back(fake_llm):
    wrong = agenda((10, "THEORY"), (20, "PRACTICE"), (5, "REVIEW"))  # 35 of 60: too far to auto-fix
    right = agenda((15, "THEORY"), (30, "PRACTICE"), (15, "REVIEW"))
    llm = fake_llm([wrong, right])
    state = run_agenda(llm, **AGENDA_ARGS)
    assert state["source"] == "AI"
    assert state["attempts"] == 2
    assert "35" in llm.prompts[1] and "60" in llm.prompts[1]  # the repair prompt names the problem


def test_agenda_small_drift_is_fixed_without_another_call(fake_llm):
    llm = fake_llm([agenda((15, "THEORY"), (30, "PRACTICE"), (12, "REVIEW"))])  # 57 of 60
    state = run_agenda(llm, **AGENDA_ARGS)
    assert state["attempts"] == 1
    assert state["items"][-1]["plannedMinutes"] == 15


def test_agenda_falls_back_to_25_50_25_after_three_bad_answers(fake_llm):
    llm = fake_llm(["ليس JSON"])
    state = run_agenda(llm, **{**AGENDA_ARGS, "duration_minutes": 90})
    assert state["source"] == "FALLBACK"
    assert len(llm.prompts) == 3
    assert [i["plannedMinutes"] for i in state["items"]] == [22, 45, 23]  # sums to exactly 90


def test_agenda_falls_back_when_the_model_is_down(fake_llm):
    llm = fake_llm([None])
    state = run_agenda(llm, **AGENDA_ARGS)
    assert state["source"] == "FALLBACK"
    assert len(llm.prompts) == 1


def test_agenda_missing_phase_is_repaired(fake_llm):
    no_review = agenda((30, "THEORY"), (30, "PRACTICE"))
    llm = fake_llm([no_review, agenda((15, "THEORY"), (30, "PRACTICE"), (15, "REVIEW"))])
    state = run_agenda(llm, **AGENDA_ARGS)
    assert state["source"] == "AI" and state["attempts"] == 2
    assert "REVIEW" in llm.prompts[1]


# ── Summary + quiz (FR-8.1 / FR-8.5 / Q-21) ─────────────────────────────────────────────────

def test_summary_valid_first_try(fake_llm):
    state = run_summary(fake_llm([summary_reply()]), **SUMMARY_ARGS)
    assert state["status"] == "AI"
    assert len(state["questions"]) == 3
    assert state["summary"]["exercises"][0]["title"] == "جدول الضرب"


def test_summary_repairs_a_broken_quiz(fake_llm):
    llm = fake_llm([summary_reply(questions=2), summary_reply()])
    state = run_summary(llm, **SUMMARY_ARGS)
    assert state["status"] == "AI"
    assert "3" in llm.prompts[1]


def test_summary_kept_without_quiz_when_quiz_cannot_be_fixed(fake_llm):
    llm = fake_llm([summary_reply(broken_question=True)])
    state = run_summary(llm, **SUMMARY_ARGS)
    assert state["status"] == "PARTIAL"
    assert state["summary"]["summary"].startswith("ملخص")
    assert state["questions"] is None


def test_summary_failed_when_nothing_is_usable(fake_llm):
    state = run_summary(fake_llm(["{}"]), **SUMMARY_ARGS)
    assert state["status"] == "FAILED"
    assert state["summary"] is None and state["questions"] is None


def test_summary_failed_when_model_is_down(fake_llm):
    state = run_summary(fake_llm([None]), **SUMMARY_ARGS)
    assert state["status"] == "FAILED"


# ── Privacy (FR-8.6 / Q-22) ──────────────────────────────────────────────────────────────────

def test_scrub_masks_names_contacts_and_links():
    text = "سارة الحلبي شرحت لعمر. تواصل: sara@mail.com أو +963 944 123 456 أو https://meet.google.com/abc"
    out = scrub(text, ["سارة الحلبي", "عمر الشامي"])
    for leaked in ("سارة", "الحلبي", "عمر", "sara@mail.com", "944", "meet.google.com"):
        assert leaked not in out
    assert "المشارك" in out


def test_no_personal_data_reaches_the_model(fake_llm):
    llm = fake_llm([summary_reply()])
    run_summary(llm, **{**SUMMARY_ARGS, "notes": "ملاحظة من ليلى المصري: layla@x.com",
                        "participant_names": ["ليلى المصري"]})
    assert "ليلى" not in llm.prompts[0] and "layla@x.com" not in llm.prompts[0]
