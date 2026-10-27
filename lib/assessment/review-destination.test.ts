import { describe, expect, it } from "vitest"
import { reviewDestination } from "./review-destination"

const attempt = { attemptId: 42, assessmentId: 11, capabilityId: 8, profileId: "emp-1" }

describe("reviewDestination", () => {
  it("sends a manager of the employee to the manager review page", () => {
    expect(reviewDestination(attempt, { managesEmployee: true, ownsCapability: false })).toBe(
      "/protected/manager/assessments/11/review?profileId=emp-1&attemptId=42"
    )
  })

  it("sends the capability owner to the capability's attempt review", () => {
    expect(reviewDestination(attempt, { managesEmployee: false, ownsCapability: true })).toBe(
      "/protected/capability/8/assessments/11/attempt-review?profileId=emp-1&attemptId=42"
    )
  })

  it("prefers the manager page for someone who is both", () => {
    expect(reviewDestination(attempt, { managesEmployee: true, ownsCapability: true })).toMatch(/^\/protected\/manager\//)
  })

  it("has nowhere to go for anyone else", () => {
    expect(reviewDestination(attempt, { managesEmployee: false, ownsCapability: false })).toBeNull()
  })
})
