import { describe, expect, it } from "vitest"
import { resultsHref } from "./results-href"

describe("resultsHref", () => {
  it("links a completed attempt to its results", () => {
    expect(resultsHref({ assessmentStatus: "completed", attemptId: 12 })).toBe("/protected/employee/results/12")
  })

  it("has no link for a closed attempt, which was never fully graded", () => {
    expect(resultsHref({ assessmentStatus: "closed", attemptId: 12 })).toBeNull()
  })

  it("has no link without an attempt", () => {
    expect(resultsHref({ assessmentStatus: "completed", attemptId: null })).toBeNull()
    expect(resultsHref({ assessmentStatus: "in_progress", attemptId: 12 })).toBeNull()
  })
})
