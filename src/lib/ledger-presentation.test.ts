import { describe, expect, it } from "vitest";
import { getLedgerEntryMeta } from "./ledger-presentation";

describe("Ledger Presentation (FR-2.1)", () => {
  it("provides Arabic metadata and tones for every ledger entry type", () => {
    const types = [
      "WELCOME_BONUS",
      "SESSION_FREEZE",
      "SESSION_REFUND",
      "SESSION_RELEASE_DEBIT",
      "SESSION_RELEASE_CREDIT",
      "BARTER_SETTLEMENT_DEBIT",
      "BARTER_SETTLEMENT_CREDIT",
      "ADMIN_ADJUSTMENT",
    ] as const;

    for (const t of types) {
      const meta = getLedgerEntryMeta(t);
      expect(meta.title).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.tone).toBeTruthy();
      expect(["credit", "debit", "freeze", "refund", "neutral"]).toContain(meta.direction);
    }
  });

  it("handles WELCOME_BONUS with success tone and credit direction", () => {
    const meta = getLedgerEntryMeta("WELCOME_BONUS");
    expect(meta.title).toBe("مكافأة ترحيبية");
    expect(meta.tone).toBe("success");
    expect(meta.direction).toBe("credit");
  });

  it("handles SESSION_FREEZE with cyan tone and freeze direction", () => {
    const meta = getLedgerEntryMeta("SESSION_FREEZE");
    expect(meta.title).toBe("تجميد رصيد لجلسة");
    expect(meta.tone).toBe("cyan");
    expect(meta.direction).toBe("freeze");
  });
});
