import { describe, expect, it } from "vitest";
import { meetUrlSchema, normalizeMeetUrl } from "./meeting-url";

describe("Google Meet links (FR-5.2 / Q-34)", () => {
  it("accepts Meet meeting codes and Workspace lookup links", () => {
    expect(normalizeMeetUrl("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(normalizeMeetUrl("  https://meet.google.com/abc-defg-hij?authuser=0 ")).toBe(
      "https://meet.google.com/abc-defg-hij?authuser=0",
    );
    expect(normalizeMeetUrl("https://meet.google.com/lookup/chronoswap-python")).not.toBeNull();
  });

  it("rejects empty, other services, plain http, look-alike hosts and scripts", () => {
    for (const bad of [
      "",
      "meet.google.com/abc-defg-hij",
      "http://meet.google.com/abc-defg-hij",
      "https://zoom.us/j/123456789",
      "https://meet.google.com.evil.com/abc-defg-hij",
      "https://meet.google.com/",
      "https://meet.google.com/not-a-code",
      "javascript:alert(1)",
    ]) {
      expect(normalizeMeetUrl(bad), bad).toBeNull();
    }
  });

  it("gives an Arabic message for a missing link", () => {
    const result = meetUrlSchema.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("إلزامي");
  });
});
