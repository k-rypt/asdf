import { describe, expect, it } from "vitest"
import { checkOwnerAssignment } from "./capability-owner"

describe("checkOwnerAssignment", () => {
  it("allows an active capability owner", () => {
    expect(checkOwnerAssignment("u1", ["u1", "u2"])).toEqual({ ok: true })
  })

  it("allows clearing the owner", () => {
    expect(checkOwnerAssignment(null, [])).toEqual({ ok: true })
  })

  it("refuses anyone who isn't an active capability owner", () => {
    expect(checkOwnerAssignment("u9", ["u1"])).toEqual({
      ok: false,
      status: 400,
      error: "Only an active capability owner can own a capability.",
    })
  })

  it("refuses a malformed owner id", () => {
    expect(checkOwnerAssignment(42, ["u1"])).toEqual({
      ok: false,
      status: 400,
      error: "ownerId must be a user id or null.",
    })
    expect(checkOwnerAssignment(undefined, ["u1"])).toMatchObject({ ok: false, status: 400 })
  })
})
