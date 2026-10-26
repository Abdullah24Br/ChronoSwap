import { describe, expect, it } from "vitest";
import { formatDateTime, formatMinutes, formatTimeAmount, hoursToMinutes, isValidTimeZone } from "./time";

describe("formatTimeAmount", () => {
  it.each([
    [0, "0 ساعة"],
    [30, "0.5 ساعة"],
    [60, "1 ساعة"],
    [90, "1.5 ساعة"],
    [120, "2 ساعة"],
    [45, "0.75 ساعة"],
    [20, "0.33 ساعة"],
    [60_000, "1,000 ساعة"],
  ])("%i minutes → %s", (minutes, expected) => {
    expect(formatTimeAmount(minutes)).toBe(expected);
  });

  it("signs ledger amounts", () => {
    expect(formatTimeAmount(30, { signed: true })).toBe("+0.5 ساعة");
    expect(formatTimeAmount(-90)).toBe("−1.5 ساعة");
    expect(formatTimeAmount(0, { signed: true })).toBe("0 ساعة");
  });

  it("rejects non-integer minutes (no floats in balances)", () => {
    expect(() => formatTimeAmount(1.5)).toThrow(TypeError);
  });
});

describe("hoursToMinutes", () => {
  it("converts hours to integer minutes", () => {
    expect(hoursToMinutes(0.5)).toBe(30);
    expect(hoursToMinutes(2)).toBe(120);
    expect(hoursToMinutes(1.1)).toBe(66);
  });
  it("rejects fractions of a minute", () => {
    expect(() => hoursToMinutes(0.333)).toThrow(TypeError);
  });
});

describe("formatMinutes", () => {
  it("labels minutes", () => expect(formatMinutes(90)).toBe("90 دقيقة"));
});

describe("time zones", () => {
  it("validates IANA zones", () => {
    expect(isValidTimeZone("Asia/Damascus")).toBe(true);
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("renders the same instant in each viewer's zone with Latin digits", () => {
    const instant = new Date("2026-03-29T12:00:00Z");
    const opts = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
    expect(formatDateTime(instant, "Asia/Damascus", opts)).toContain("15:00");
    expect(formatDateTime(instant, "Europe/Berlin", opts)).toContain("14:00"); // CEST after DST switch
  });
});
