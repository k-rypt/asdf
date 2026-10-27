import { describe, expect, it } from "vitest"
import { publishConflictFailure } from "./publish-conflict"

describe("publishConflictFailure", () => {
  it("turns the one-published-per-capability violation into a clear 409", () => {
    expect(
      publishConflictFailure({
        code: "23505",
        message: 'duplicate key value violates unique constraint "assessments_one_published_per_capability"',
      })
    ).toEqual({
      ok: false,
      status: 409,
      error: "Another version was just published for this capability. Refresh and try again.",
    })
  })

  it("leaves other errors alone", () => {
    expect(publishConflictFailure({ code: "23505", message: 'violates unique constraint "other_index"' })).toBeNull()
    expect(publishConflictFailure({ code: "42501", message: "permission denied" })).toBeNull()
  })
})
