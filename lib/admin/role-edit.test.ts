import { describe, expect, it } from "vitest"
import { checkRoleEditAllowed, roleSetupNotes, ROLE } from "./role-edit"

const base = {
  callerId: "admin-1",
  targetId: "emp-1",
  targetExists: true,
  targetArchived: false,
  currentRoleIds: [ROLE.employee],
  nextRoleIds: [ROLE.employee, ROLE.manager],
  nonInactiveAdminCount: 2,
  liveAssessmentNames: [] as string[],
}

describe("checkRoleEditAllowed", () => {
  it("allows a normal change", () => {
    expect(checkRoleEditAllowed(base)).toEqual({ ok: true })
  })

  it("refuses an empty role list", () => {
    expect(checkRoleEditAllowed({ ...base, nextRoleIds: [] })).toEqual({
      ok: false,
      status: 400,
      error: "Keep at least one role -- without one they can't sign in.",
    })
  })

  it("refuses unknown role ids", () => {
    expect(checkRoleEditAllowed({ ...base, nextRoleIds: [4, 9] })).toMatchObject({ ok: false, status: 400 })
  })

  it("refuses editing your own roles", () => {
    expect(checkRoleEditAllowed({ ...base, targetId: "admin-1" })).toMatchObject({ ok: false, status: 400 })
  })

  it("returns 404 for a missing profile and 409 for an archived one", () => {
    expect(checkRoleEditAllowed({ ...base, targetExists: false })).toMatchObject({ ok: false, status: 404 })
    expect(checkRoleEditAllowed({ ...base, targetArchived: true })).toMatchObject({ ok: false, status: 409 })
  })

  it("refuses removing admin from the last active admin", () => {
    expect(
      checkRoleEditAllowed({
        ...base,
        currentRoleIds: [ROLE.admin],
        nextRoleIds: [ROLE.manager],
        nonInactiveAdminCount: 1,
      })
    ).toEqual({ ok: false, status: 409, error: "You can't remove Admin from the last active admin." })
  })

  it("allows removing admin when another admin remains", () => {
    expect(
      checkRoleEditAllowed({ ...base, currentRoleIds: [ROLE.admin], nextRoleIds: [ROLE.manager], nonInactiveAdminCount: 2 })
    ).toEqual({ ok: true })
  })

  it("refuses removing Employee while they're taking an assessment", () => {
    expect(
      checkRoleEditAllowed({ ...base, nextRoleIds: [ROLE.manager], liveAssessmentNames: ["Python"] })
    ).toEqual({
      ok: false,
      status: 409,
      error: "They're taking Python right now. You can remove Employee once they finish.",
    })
  })

  it("doesn't let a live attempt block other changes", () => {
    expect(checkRoleEditAllowed({ ...base, liveAssessmentNames: ["Python"] })).toEqual({ ok: true })
  })
})

describe("roleSetupNotes", () => {
  it("reminds about a department for a manager who manages none", () => {
    expect(roleSetupNotes([ROLE.manager], { managesDepartment: false, ownsCapability: true })).toEqual([
      "They won't see a team until you make them a department manager in Departments.",
    ])
  })

  it("reminds about a capability for an owner who owns none", () => {
    expect(roleSetupNotes([ROLE.capabilityOwner], { managesDepartment: true, ownsCapability: false })).toEqual([
      "They won't own anything until you set them as a capability's owner on its page.",
    ])
  })

  it("has nothing to say when everything is set up", () => {
    expect(roleSetupNotes([ROLE.manager, ROLE.capabilityOwner], { managesDepartment: true, ownsCapability: true })).toEqual([])
  })
})
