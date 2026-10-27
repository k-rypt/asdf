import { describe, expect, it } from "vitest"
import { parseProfileDetails } from "./profile-details"

describe("parseProfileDetails", () => {
  it("trims and accepts names with a job title", () => {
    expect(parseProfileDetails({ givenName: " Ana ", lastName: "Cruz ", jobTitle: " QA Lead " })).toEqual({
      ok: true,
      details: { givenName: "Ana", lastName: "Cruz", jobTitle: "QA Lead" },
    })
  })

  it("treats a blank job title as cleared", () => {
    expect(parseProfileDetails({ givenName: "Ana", lastName: "Cruz", jobTitle: "  " })).toEqual({
      ok: true,
      details: { givenName: "Ana", lastName: "Cruz", jobTitle: null },
    })
  })

  it("requires first and last name", () => {
    expect(parseProfileDetails({ givenName: "Ana", lastName: " " })).toEqual({
      ok: false,
      error: "First and last name are required.",
    })
    expect(parseProfileDetails(null)).toMatchObject({ ok: false })
  })

  it("ignores non-string values", () => {
    expect(parseProfileDetails({ givenName: 1, lastName: "Cruz" })).toMatchObject({ ok: false })
  })

  it("refuses overly long values", () => {
    expect(parseProfileDetails({ givenName: "a".repeat(101), lastName: "Cruz" })).toMatchObject({ ok: false })
  })
})
