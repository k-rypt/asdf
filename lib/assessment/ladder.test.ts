import { describe, expect, it } from "vitest"
import {
  canSyncTiers,
  isKindDisabled,
  mergeLadderLevels,
  mixesLadderAndGraded,
  toQuestionKind,
  trimToFirstKindGroup,
  missingTierLevels,
  missingLevelsMessage,
  parseLadderLevelInput,
  planTierSnapshot,
  rowToLevel,
  type LadderLevel,
} from "./ladder"

const level = (sfiaLevel: number, label = `P${sfiaLevel}`): LadderLevel => ({
  sfiaLevel,
  label,
  appliesTo: null,
  passThreshold: 0.6,
  advanceMessage: null,
  stayMessage: null,
})

describe("isKindDisabled", () => {
  it("keeps the ladder and graded types apart", () => {
    expect(isKindDisabled(new Set(), "yes_no")).toBe(false)
    expect(isKindDisabled(new Set(), "multiple_choice")).toBe(false)
    expect(isKindDisabled(new Set(["yes_no"]), "multiple_choice")).toBe(true)
    expect(isKindDisabled(new Set(["yes_no"]), "yes_no")).toBe(false)
    expect(isKindDisabled(new Set(["code_snippet"]), "yes_no")).toBe(true)
    expect(isKindDisabled(new Set(["code_snippet"]), "true_false")).toBe(false)
  })
})

describe("parseLadderLevelInput", () => {
  it("trims, defaults the threshold to 60% and blanks to null", () => {
    expect(parseLadderLevelInput({ label: " P1 – Beginner ", appliesTo: " ", stayMessage: "Train" }, 1)).toEqual({
      ok: true,
      level: { sfiaLevel: 1, label: "P1 – Beginner", appliesTo: null, passThreshold: 0.6, advanceMessage: null, stayMessage: "Train" },
    })
  })

  it("treats a blank or whitespace-only threshold as the 60% default", () => {
    expect(parseLadderLevelInput({ label: "P1", passThreshold: "" }, 1)).toMatchObject({ ok: true, level: { passThreshold: 0.6 } })
    expect(parseLadderLevelInput({ label: "P1", passThreshold: "  " }, 1)).toMatchObject({ ok: true, level: { passThreshold: 0.6 } })
  })

  it("requires a name and a 0-1 threshold", () => {
    expect(parseLadderLevelInput({ label: "" }, 1)).toMatchObject({ ok: false })
    expect(parseLadderLevelInput(null, 1)).toMatchObject({ ok: false })
    expect(parseLadderLevelInput({ label: "P1", passThreshold: 1.2 }, 1)).toMatchObject({ ok: false })
    expect(parseLadderLevelInput({ label: "P1", passThreshold: "x" }, 1)).toMatchObject({ ok: false })
  })
})

describe("mergeLadderLevels", () => {
  it("adds only missing levels and reports the kept ones", () => {
    const existing = [level(2, "P2 – Mine"), level(3, "P3 – Mine")]
    const drafted = [level(3, "P3 – AI"), level(2, "P2 – AI"), level(1, "P1 – AI"), level(4, "P4 – AI")]
    expect(mergeLadderLevels(existing, drafted)).toEqual({
      add: [level(1, "P1 – AI"), level(4, "P4 – AI")],
      kept: [2, 3],
    })
  })

  it("ignores a level drafted twice", () => {
    expect(mergeLadderLevels([], [level(1, "a"), level(1, "b")]).add).toEqual([level(1, "a")])
  })
})

describe("planTierSnapshot", () => {
  it("copies only the levels the questions use, in level order, and reports gaps", () => {
    const ladder = [level(3), level(1), level(2)]
    expect(planTierSnapshot(7, ladder, [3, 1, 3, 5])).toEqual({
      rows: [
        { assessment_id: 7, sfia_level: 1, label: "P1", applies_to: null, pass_threshold: 0.6, advance_message: null, stay_message: null, position: 0 },
        { assessment_id: 7, sfia_level: 3, label: "P3", applies_to: null, pass_threshold: 0.6, advance_message: null, stay_message: null, position: 1 },
      ],
      missingLevels: [5],
    })
  })
})

describe("canSyncTiers", () => {
  it("only re-copies tiers while the assessment is editable", () => {
    expect(canSyncTiers("draft")).toBe(true)
    expect(canSyncTiers("pending_approval")).toBe(true)
    expect(canSyncTiers("rejected")).toBe(true)
    expect(canSyncTiers("published")).toBe(false)
    expect(canSyncTiers(null)).toBe(false)
  })
})

describe("rowToLevel", () => {
  it("reads numeric thresholds that arrive as strings", () => {
    expect(
      rowToLevel({ sfia_level: 2, label: "P2", applies_to: null, pass_threshold: "0.75", advance_message: null, stay_message: null })
        .passThreshold
    ).toBe(0.75)
  })
})

describe("missingTierLevels", () => {
  it("returns the question levels with no tier, deduped and sorted", () => {
    expect(missingTierLevels([5, 3, 2, 5, 3], [2, 4])).toEqual([3, 5])
  })
  it("is empty when every level has a tier, or there are no ladder questions", () => {
    expect(missingTierLevels([1, 2], [1, 2, 3])).toEqual([])
    expect(missingTierLevels([], [])).toEqual([])
  })
})

describe("missingLevelsMessage", () => {
  it("lists every missing level", () => {
    expect(missingLevelsMessage([3], "before publishing")).toBe(
      "Set up SFIA 3 in the Self-assessment ladder before publishing."
    )
    expect(missingLevelsMessage([3, 5], "first")).toBe("Set up SFIA 3, 5 in the Self-assessment ladder first.")
  })
})

describe("toQuestionKind", () => {
  it("keeps known kinds and treats unknown types as graded", () => {
    expect(toQuestionKind("yes_no")).toBe("yes_no")
    expect(toQuestionKind("code_snippet")).toBe("code_snippet")
    expect(isKindDisabled(new Set(["yes_no"]), toQuestionKind("essay"))).toBe(true)
    expect(isKindDisabled(new Set([toQuestionKind("essay")]), "yes_no")).toBe(true)
  })
})

describe("mixesLadderAndGraded", () => {
  it("is false for an empty list, all yes/no, or all graded", () => {
    expect(mixesLadderAndGraded([])).toBe(false)
    expect(mixesLadderAndGraded(["yes_no", "yes_no"])).toBe(false)
    expect(mixesLadderAndGraded(["multiple_choice", "true_false", "code_snippet"])).toBe(false)
  })
  it("is true when yes/no sits with any graded type, including unknown ones", () => {
    expect(mixesLadderAndGraded(["yes_no", "multiple_choice"])).toBe(true)
    expect(mixesLadderAndGraded(["essay", "yes_no"])).toBe(true)
  })
  it("treats unknown types alone as graded, not mixed", () => {
    expect(mixesLadderAndGraded(["essay", "multiple_choice"])).toBe(false)
  })
})

describe("trimToFirstKindGroup", () => {
  const types = new Map([
    ["a", "yes_no"],
    ["b", "multiple_choice"],
    ["c", "yes_no"],
    ["d", "essay"],
  ])
  it("keeps only ids in the first id's group (ladder vs graded), in order", () => {
    expect(trimToFirstKindGroup(["a", "b", "c", "d"], types)).toEqual(["a", "c"])
    expect(trimToFirstKindGroup(["b", "a", "d", "c"], types)).toEqual(["b", "d"])
  })
  it("drops ids that aren't in the pool and decides the group from the first known one", () => {
    expect(trimToFirstKindGroup(["zzz", "c", "b"], types)).toEqual(["c"])
  })
  it("returns an empty list for no ids", () => {
    expect(trimToFirstKindGroup([], types)).toEqual([])
  })
})
