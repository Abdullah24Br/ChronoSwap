import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath (NFR-1)", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/sessions/abc?tab=quiz")).toBe("/sessions/abc?tab=quiz");
  });

  it("falls back for empty or foreign targets", () => {
    for (const bad of [null, undefined, "", "admin", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
