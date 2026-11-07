# Open questions & chosen defaults

Ambiguities, contradictions, and edge cases found in [SRS.md](SRS.md). Each has a **default** that the code follows until the team decides otherwise. Nothing here blocks development.

⭐ = should be answered before Phase 1, because it changes how booking, wallet, or schema code is written.

Status legend: `DEFAULT` (assumed, not yet confirmed) · `CONFIRMED` (answered by the team).

The seven open rules in [SUPERVISOR_DECISIONS.md](SUPERVISOR_DECISIONS.md) were decided on 2026-11-08: all defaults kept, except Q-18 (barter legs can now be re-booked).

---

## Accounts & availability

### Q-1 · FR-1.2 · What counts as "the same e-mail" for the welcome bonus? `DEFAULT`
Gmail ignores dots and `+tags` (`sara+2@gmail.com` reaches `sara@gmail.com`), so one person could farm the 2-hour bonus.
**Default:** normalise only by trimming and lower-casing. `welcome_bonus_grants.email` is unique, so each normalised address gets the bonus once ever, even if the account is deleted and re-created. Alias stripping can be added later without a schema change.

### Q-2 · FR-1.1 · What can an unverified user do? `DEFAULT`
**Default:** they can log in but only see a "check your e-mail / resend link" screen. Verification links expire after 24h and can be re-sent at most once per minute. The welcome bonus is granted at the moment of verification.

### Q-3 · FR-1.4 · Weekly slots vs. daylight-saving time `DEFAULT`
"Store times in UTC" is correct for instants (sessions) but wrong for recurring slots: "Monday 18:00 Berlin" is 16:00 UTC in summer and 17:00 UTC in winter.
**Default:** `availability_slots` stores the local wall-clock time (weekday, start/end minutes) plus the IANA zone. Concrete UTC instants are computed per week when checking a booking. Sessions themselves are stored in UTC. If a DST jump removes an hour, the slot shrinks for that day; if an hour repeats, we use the first occurrence. Slots never cross midnight (the UI splits them in two). (Syria has had no DST since 2022, but users abroad do.)

### Q-4 · FR-1.4 · What happens to slots when a user changes their time zone? `DEFAULT`
**Default:** slots keep the same local times ("Mon 18:00–21:00") and move to the new zone. Already-booked sessions don't move, because they are fixed UTC instants.

### Q-31 · FR-1.3 · Can a skill be both offered and wanted by the same user? `DEFAULT`
**Default:** no (validated in the service). It would create self-loops in the barter graph.

---

## Booking & cancellation

### Q-5 ⭐ · FR-6.3 · How is "3 hours per week between the same two users" measured? `CONFIRMED`
Unclear points: which week, which direction, and which statuses count.
**Default:**
- Week = ISO week (Monday 00:00 → Sunday 24:00, **UTC**) containing the session's start.
- **Both directions** count (A teaches B, plus B teaches A).
- Barter sessions count.
- Counted statuses: everything except REJECTED, AUTO_REJECTED, CANCELLED, NO_SHOW_TEACHER, NO_SHOW_BOTH, and RESOLVED_REFUNDED (sessions that didn't really happen).
- Checked when the request is sent (as the SRS says) and again on accept.

**Alternative:** a rolling 7-day window (stricter but harder to explain in the UI).

### Q-11 ⭐ · FR-4.1 / FR-4.6 · Minimum notice for a booking request `CONFIRMED`
A request can be sent for 10 minutes from now, which the teacher can't realistically answer. A session accepted less than 12h before its start can never be cancelled "in time".
**Default:** sessions must start at least **2 hours** after the request. The teacher may accept until the start time. The UI warns both sides when accepting inside the 12h window that cancelling will count as absence.

### Q-12 · FR-4.2 · Overlapping pending requests to the same teacher `DEFAULT`
**Default:** several pending requests may overlap. When the teacher accepts one, every overlapping pending request to that teacher is auto-rejected with a refund (`FR-4.2:slot-taken`). New requests that overlap an already accepted session are refused immediately. The DB exclusion constraint guarantees that accepted sessions never overlap, for the teacher or for the learner.

### Q-29 · FR-4.2 · Exact auto-reject moment `DEFAULT`
**Default:** at the session's start time (`startAt`), by the scheduled job (NFR-3).

### Q-10 · FR-4.6 · Learner late-cancels (< 12h): does the "teacher present" condition apply? `DEFAULT`
The clause "(مع حضور المدرّس)" naturally fits the "didn't join the room" case, not a cancellation.
**Default:** a learner's late cancellation always pays the teacher (they kept the slot free). A teacher's late cancellation always refunds the learner.

---

## The session room

### Q-8 ⭐ · FR-5.1 / FR-4.6 · When does the room open, and which entries count as attendance? `CONFIRMED`
If the room opens at acceptance (needed to paste the Meet link), a teacher who opens it two days early shouldn't count as "present".
**Default:** the room is accessible from acceptance onwards (link, notes, preparation). Attendance (`AttendanceLog` JOIN) counts toward no-show detection only if it falls within **[start − 15 min, start + 15 min]**. The session becomes IN_PROGRESS when both have a counted JOIN. At start + 15 min the job decides: teacher missing → NO_SHOW_TEACHER; learner missing (teacher present) → NO_SHOW_LEARNER; both missing → NO_SHOW_BOTH.

### Q-9 · FR-4.6 · Both participants absent `DEFAULT`
Not covered by the SRS.
**Default:** status NO_SHOW_BOTH and a full refund to the learner, since no teaching was delivered.

### Q-28 · FR-5.4 · When does the countdown start? `DEFAULT`
**Default:** it runs from the scheduled `startAt` to `endAt`, not from the moment people join, so late joiners lose time (consistent with FR-4.5).

### Q-13 · FR-5.4 / FR-6.1 · Can participants edit the agenda? `DEFAULT`
If they could, a teacher could add trivial tasks to reach 50% instantly.
**Default:** the agenda is fixed once generated (AI or fallback). Both participants can tick and un-tick items until the session ends. The completion percentage is snapshotted at the end (`sessions.completion_percent`).

### Q-7 ⭐ · FR-6.1 · Does "complete session" need one click or both? `CONFIRMED`
"يُفعَّل لكلا الطرفين … ويؤدي الضغط عليه إلى إنهاء الجلسة" can be read as "either side may press it" or "both must press it".
**Default:** **either** participant may end the session once ≥ 50% of tasks are ticked. The learner stays protected by the quiz and by the 48h report window.
**Alternative:** require both to confirm, which needs extra "waiting for the other side" UI.

---

## After the session: quiz, release, disputes

### Q-6 · FR-6.4 / FR-8.4 / FR-7.2 · The 48h timer ends while a dispute is open `DEFAULT`
**Default:** a DISPUTED session is excluded from the release job. Frozen hours stay frozen until the admin decides. There is no automatic resolution and no admin deadline. The admin panel sorts disputes oldest-first.

### Q-14 · FR-8.3 · Does the quiz score matter for release? `CONFIRMED`
**Default:** no. Submitting the quiz (any score) releases the hours. The score is stored as evidence for disputes. There is one attempt only, since answers are revealed afterwards.

### Q-23 · FR-6.4 · Solving the quiz closes the report window early `DEFAULT`
"Available until release" means a learner who solves the quiz after 5 minutes releases the hours, and the teacher can no longer report a problem.
**Default:** accepted as written. The UI tells the learner that submitting the quiz confirms the session.

### Q-24 · FR-6.4 · Can no-show outcomes be disputed? `DEFAULT`
**Default:** no. They are settled immediately from attendance logs, and the report button only exists after a session ENDED. An admin can correct mistakes with an `ADMIN_ADJUSTMENT` ledger entry (the ledger is never edited).

### Q-21 · FR-8.1 / FR-8.5 · Partial AI failure `DEFAULT`
**Default:** if the summary is valid but the quiz is malformed (not exactly 3 questions with valid options), keep the summary and follow the FR-8.5 path for release (48h, no quiz). Any invalid response counts as a failure, and NFR-5 caps the wait at 30s.

### Q-22 · FR-8.6 · Learner goals and notes may contain personal data `DEFAULT`
**Default:** before calling the AI, replace participant names with «المتعلم» / «المدرّس», and mask e-mail addresses, phone numbers, and URLs with a regex scrubber. Only skill, goal, agenda, notes, and code are sent.

### Q-15 · FR-6.2 · Who rates, and when? `DEFAULT`
**Default:** only the learner rates the teacher, once per session, after it ENDED (including disputed sessions, excluding no-shows and cancellations). Ratings cannot be edited. Teachers do not rate learners.

---

## Barter (FR-3.3 / FR-3.4)

### Q-16 ⭐ · FR-3.4 · Debt rules `CONFIRMED`
- **Debt is created** only when a failed cycle is settled and the learner's available balance is short. Available goes to 0 and the rest becomes a `Debt` row.
- **Repayment:** debt is paid from **earnings only** (teaching credits and admin "pay teacher" decisions), FIFO, before anything reaches available. Refunds of the user's own frozen hours are not earnings.
- **While in debt** the user cannot request sessions or join new barter cycles, but **can still teach** (that's how they repay).
- **Alternative to decide:** also let a debtor pay voluntarily from available balance (e.g. after a refund). This is not in the SRS.

### Q-17 · FR-3.4 / FR-4.6 · No-shows inside a barter session `DEFAULT`
**Default:** apply the normal FR-4.6 outcomes with "settle" instead of "release". A learner who is absent or cancels late makes that session failed for the cycle and pays the teacher from available (shortfall → debt). A teacher who is absent makes the session failed with nothing to refund (no escrow). Either way the cycle becomes FAILED.

### Q-18 · FR-3.4 · Cycle lifecycle details `CONFIRMED`
- **Proposal:** the barter engine finds the cycle, and the user who triggers the search proposes a duration (30/60/90/120). The other two accept or decline. It expires after **72h** (EXPIRED) and any decline makes it DECLINED.
- **Booking:** once ACTIVE, each learner books their session through the normal request/accept flow (no freeze). All three sessions must be **booked within 14 days**, otherwise the missing ones count as failed. **Decided 2026-11-08:** a rejected, auto-rejected or cancelled barter request may be **re-booked** before that deadline; at most one live request per leg (partial unique index `sessions_one_live_barter_leg`). After the deadline no new requests are accepted and a leg without a live session fails the cycle (`reconcileBarterCycles`).
- **Limits:** the FR-6.3 weekly cap applies to barter sessions. Users with debt can't join (Q-16). A user may be in several cycles at once.

### Q-19 · FR-3.4 · What happens to unfinished sessions when a cycle fails? `DEFAULT`
**Default:** they continue. Each one is settled as a normal session as soon as it completes (`BARTER_COMPLETED → RELEASED`). Sessions already completed are settled immediately.

### Q-20 · FR-3.4 · Do barter sessions need teacher acceptance? `DEFAULT`
All three already agreed to the cycle, but the exact time still needs agreement.
**Default:** yes, they use the normal request → accept flow (the SRS says "executed as a normal session").

---

## Admin & statistics

### Q-25 · FR-7.1 · What does "delete a skill" do? `DEFAULT`
**Default:** it archives the skill (`is_active = false`). Archived skills are hidden from search, profiles, and booking, while past sessions keep their reference. Hard deletion is only possible for skills nobody ever used.

### Q-26 · FR-1.1 · Can an admin also learn or teach? `DEFAULT`
**Default:** no. Admin accounts have no wallet and cannot take part in sessions, which keeps the dispute judge neutral.

### Q-27 · FR-7.3 · Definition of "hours exchanged" `DEFAULT`
**Default:** the sum of `duration_minutes` for sessions in RELEASED, RESOLVED_RELEASED, or BARTER_SETTLED, shown in hours.

---

## Presentation & scope

### Q-30 · NFR-4 · Digits `DEFAULT`
**Default:** Latin digits (`1.5 ساعة`) everywhere, in a monospace face for balances and times. The `TimeAmount` component is the only way balances are rendered.

### Q-32 · FR-4.1 · Self-booking
**Answered by design:** a DB CHECK prevents a session whose teacher and learner are the same user.

### Q-33 · Scope · Password reset, e-mail change, notifications
These are not in the SRS v2 and are out of scope unless the team adds them. The schema doesn't block them (tokens can reuse the verification-token pattern).
