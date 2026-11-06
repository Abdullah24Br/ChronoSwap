import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { updateSkillsSchema } from "./schemas";

describe("Skills Matrix Schema (FR-1.3)", () => {
  it("accepts valid disjoint offered and wanted skill lists", () => {
    const skillA = randomUUID();
    const skillB = randomUUID();
    const skillC = randomUUID();

    const parsed = updateSkillsSchema.safeParse({
      offeredSkillIds: [skillA, skillB],
      wantedSkillIds: [skillC],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts empty lists", () => {
    const parsed = updateSkillsSchema.safeParse({
      offeredSkillIds: [],
      wantedSkillIds: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects when the same skill is both offered and wanted (FR-1.3 disjointness rule)", () => {
    const sharedSkill = randomUUID();
    const otherSkill = randomUUID();

    const parsed = updateSkillsSchema.safeParse({
      offeredSkillIds: [sharedSkill, otherSkill],
      wantedSkillIds: [sharedSkill],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("لا يمكن للمهارة أن تكون معروضة ومطلوبة");
    }
  });

  it("rejects invalid non-UUID skill identifiers", () => {
    const parsed = updateSkillsSchema.safeParse({
      offeredSkillIds: ["invalid-uuid"],
      wantedSkillIds: [],
    });

    expect(parsed.success).toBe(false);
  });
});

