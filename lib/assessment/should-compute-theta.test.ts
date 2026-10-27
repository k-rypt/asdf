import { describe, expect, it } from "vitest"
import { shouldComputeTheta } from "./should-compute-theta"

const mcq = { yesNoValue: undefined }
const code = { yesNoValue: undefined }
const yes = { yesNoValue: true }
const no = { yesNoValue: false }

describe("shouldComputeTheta", () => {
  it("is true for an attempt with only graded answers", () => {
    expect(shouldComputeTheta([mcq, code])).toBe(true)
  })

  it("is true for a mixed attempt (yes/no plus graded answers)", () => {
    expect(shouldComputeTheta([mcq, code, yes])).toBe(true)
  })

  it("is false for a pure yes/no ladder attempt", () => {
    expect(shouldComputeTheta([yes, no, yes])).toBe(false)
  })

  it("is false for an attempt with no answers", () => {
    expect(shouldComputeTheta([])).toBe(false)
  })
})
