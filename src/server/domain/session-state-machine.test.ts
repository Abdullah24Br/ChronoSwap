import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionStatus } from "@/generated/prisma/enums";
import { BLOCKING_STATUSES, TERMINAL_STATUSES, TRANSITIONS, findTransition, isTerminal } from "./session-state-machine";

const doc = readFileSync(path.resolve(__dirname, "../../../docs/SESSION_STATE_MACHINE.md"), "utf8");

describe("session state machine", () => {
  it("every transition has an FR-traceable trigger", () => {
    for (const t of TRANSITIONS) expect(t.trigger).toMatch(/^FR-\d\.\d:[a-z-]+$/);
  });

  it("terminal states have no outgoing transitions", () => {
    for (const t of TRANSITIONS) expect(isTerminal(t.from), `${t.from} is terminal`).toBe(false);
  });

  it("every non-terminal status can be left, and every status is reachable", () => {
    const all = Object.values(SessionStatus);
    const reachable = new Set<string>(["PENDING", ...TRANSITIONS.map((t) => t.to)]);
    for (const s of all) {
      expect(reachable.has(s), `${s} reachable`).toBe(true);
      if (!TERMINAL_STATUSES.includes(s)) {
        expect(TRANSITIONS.some((t) => t.from === s), `${s} has an exit`).toBe(true);
      }
    }
  });

  it("no ambiguous duplicates (same kind, from, to, trigger)", () => {
    const seen = new Set<string>();
    for (const t of TRANSITIONS) {
      for (const k of t.kinds) {
        const key = `${k}|${t.from}|${t.to}|${t.trigger}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it("DIRECT sessions never use barter-only effects and vice versa", () => {
    for (const t of TRANSITIONS) {
      if (t.wallet === "barter-settle" || t.wallet === "barter-hold") expect(t.kinds).toEqual(["BARTER"]);
      if (t.wallet === "release-to-teacher") expect(t.kinds).toEqual(["DIRECT"]);
    }
  });

  it("lookups respect the session kind", () => {
    expect(findTransition("DIRECT", "QUIZ_PENDING", "RELEASED", "FR-8.3:quiz-solved")).toBeDefined();
    expect(findTransition("BARTER", "QUIZ_PENDING", "RELEASED", "FR-8.3:quiz-solved")).toBeUndefined();
    expect(findTransition("DIRECT", "RELEASED", "DISPUTED", "FR-6.4:report")).toBeUndefined();
  });

  it("blocking statuses match the DB exclusion constraint", () => {
    expect([...BLOCKING_STATUSES]).toEqual(["ACCEPTED", "IN_PROGRESS"]);
  });

  it("docs/SESSION_STATE_MACHINE.md diagram lists every transition", () => {
    for (const t of TRANSITIONS) expect(doc, `${t.from} --> ${t.to}`).toContain(`${t.from} --> ${t.to} :`);
    for (const s of TERMINAL_STATUSES) expect(doc).toContain(`${s} --> [*]`);
  });

  it("docs transition table lists every trigger", () => {
    for (const t of TRANSITIONS) expect(doc, t.trigger).toContain(`\`${t.trigger}\``);
  });
});
