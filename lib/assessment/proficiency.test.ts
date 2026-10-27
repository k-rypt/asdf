import { describe, expect, it } from "vitest"
import { currentProficiency, type ProficiencyAttempt } from "./proficiency"

const ladder = (achieved: number, label: string) => ({
  achievedSfiaLevel: achieved,
  message: `msg ${label}`,
  tiers: [{ sfiaLevel: achieved || 1, label, passed: achieved > 0, yesCount: 3, totalCount: 5 }],
})

const attempt = (id: number, completedAt: string | null, tierResult: unknown, status = "completed"): ProficiencyAttempt => ({
  id,
  status,
  completed_at: completedAt,
  tier_result: tierResult,
  assessment_name: `Assessment ${id}`,
})

describe("currentProficiency", () => {
  it("takes the newest completed ladder result across assessments, newest first", () => {
    const result = currentProficiency([
      attempt(1, "2026-03-01T00:00:00Z", ladder(1, "P1 – Old name")),
      attempt(2, "2026-10-01T00:00:00Z", ladder(3, "P3 – Enable")),
    ])
    expect(result.current).toEqual({
      sfiaLevel: 3,
      label: "P3 – Enable",
      message: "msg P3 – Enable",
      completedAt: "2026-10-01T00:00:00Z",
      assessmentName: "Assessment 2",
      attemptId: 2,
    })
    expect(result.history.map((h) => h.label)).toEqual(["P3 – Enable", "P1 – Old name"])
  })

  it("keeps the label the result was earned under", () => {
    expect(currentProficiency([attempt(1, "2026-03-01T00:00:00Z", ladder(1, "P1 – Old name"))]).current?.label).toBe("P1 – Old name")
  })

  it("reports a stop below the first level", () => {
    expect(currentProficiency([attempt(1, "2026-03-01T00:00:00Z", ladder(0, "P1 – Beginner"))]).current).toMatchObject({
      sfiaLevel: 0,
      label: "Below P1",
    })
  })

  it("ignores unfinished and graded-only attempts", () => {
    expect(
      currentProficiency([
        attempt(1, null, ladder(2, "P2"), "in_progress"),
        attempt(2, "2026-03-01T00:00:00Z", ladder(2, "P2"), "invalidated"),
        attempt(3, "2026-03-01T00:00:00Z", null),
      ])
    ).toEqual({ current: null, history: [] })
  })

  it("reads rows written with the legacy snake_case key", () => {
    const legacy = { achieved_sfia_level: 2, tiers: [{ sfiaLevel: 2, label: "P2", passed: true, yesCount: 5, totalCount: 5 }] }
    expect(currentProficiency([attempt(1, "2026-03-01T00:00:00Z", legacy)]).current?.sfiaLevel).toBe(2)
  })
})
