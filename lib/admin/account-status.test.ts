import { describe, expect, it } from "vitest"
import { checkArchiveAllowed, checkReactivateAllowed, isArchived } from "./account-status"

const base = {
  callerId: "admin-1",
  targetId: "emp-1",
  targetStatus: "active" as const,
  targetIsAdmin: false,
  nonInactiveAdminCount: 1,
  liveAssessmentNames: [] as string[],
}

describe("checkArchiveAllowed", () => {
  it("allows archiving an active non-admin", () => {
    expect(checkArchiveAllowed(base)).toEqual({ ok: true })
  })

  it("allows archiving a pending profile", () => {
    expect(checkArchiveAllowed({ ...base, targetStatus: "pending" })).toEqual({ ok: true })
  })

  it("refuses self-archive", () => {
    const result = checkArchiveAllowed({ ...base, targetId: "admin-1", targetIsAdmin: true, nonInactiveAdminCount: 2 })
    expect(result).toEqual({ ok: false, status: 400, error: "You can't archive your own account." })
  })

  it("returns 404 when the profile doesn't exist", () => {
    expect(checkArchiveAllowed({ ...base, targetStatus: null })).toEqual({
      ok: false,
      status: 404,
      error: "User not found.",
    })
  })

  it("refuses while the person is taking an assessment", () => {
    expect(checkArchiveAllowed({ ...base, liveAssessmentNames: ["Python", "SQL"] })).toEqual({
      ok: false,
      status: 409,
      error: "They're taking Python, SQL right now. You can archive the account once they finish.",
    })
  })

  it("refuses an already archived profile", () => {
    expect(checkArchiveAllowed({ ...base, targetStatus: "inactive" })).toEqual({
      ok: false,
      status: 409,
      error: "This account is already archived.",
    })
  })

  it("refuses archiving the last non-inactive admin", () => {
    const result = checkArchiveAllowed({ ...base, targetIsAdmin: true, nonInactiveAdminCount: 1 })
    expect(result).toEqual({ ok: false, status: 409, error: "You can't archive the last active admin." })
  })

  it("counts only non-inactive admins: allows when another admin is still active", () => {
    expect(checkArchiveAllowed({ ...base, targetIsAdmin: true, nonInactiveAdminCount: 2 })).toEqual({ ok: true })
  })
})

describe("checkReactivateAllowed", () => {
  it("allows reactivating an archived profile", () => {
    expect(checkReactivateAllowed("inactive")).toEqual({ ok: true })
  })

  it("returns 404 when the profile doesn't exist", () => {
    expect(checkReactivateAllowed(null)).toEqual({ ok: false, status: 404, error: "User not found." })
  })

  it("refuses a profile that isn't archived", () => {
    expect(checkReactivateAllowed("active")).toEqual({
      ok: false,
      status: 409,
      error: "This account isn't archived.",
    })
  })
})

describe("isArchived", () => {
  it("is true only for inactive", () => {
    expect(isArchived("inactive")).toBe(true)
  })

  it("isArchived is false for pending", () => {
    expect(isArchived("pending")).toBe(false)
  })

  it("is false for active, null and undefined", () => {
    expect(isArchived("active")).toBe(false)
    expect(isArchived(null)).toBe(false)
    expect(isArchived(undefined)).toBe(false)
  })
})
