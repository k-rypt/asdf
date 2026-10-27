import { describe, expect, it } from "vitest"
import { publishedOrInProgress } from "./resolvable-assessments"

describe("publishedOrInProgress", () => {
  it("matches only published assessments when nothing is in progress", () => {
    expect(publishedOrInProgress([])).toBe("status.eq.published")
  })

  it("also matches assessments with an in-progress attempt", () => {
    expect(publishedOrInProgress([4, 9])).toBe("status.eq.published,id.in.(4,9)")
  })
})
