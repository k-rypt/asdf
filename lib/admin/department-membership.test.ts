import { describe, expect, it } from "vitest"
import { parseMembershipAction, planMembershipChange, type MembershipRow } from "./department-membership"
import { ROLE } from "./role-edit"

const rows: MembershipRow[] = [
  { profileId: "mgr", status: "management" },
  { profileId: "emp1", status: "assessment" },
  { profileId: "emp2", status: "assessment" },
]

const base = { departmentClosed: false, rows, roleIdsByProfile: {}, archivedProfileIds: [] }

describe("parseMembershipAction", () => {
  it("accepts the three actions and de-duplicates ids", () => {
    expect(parseMembershipAction({ action: "promote", profileIds: ["a", "a", "b"] })).toEqual({
      action: "promote",
      profileIds: ["a", "b"],
    })
    expect(parseMembershipAction({ action: "demote", profileIds: ["a"], replacementId: "b" })).toEqual({
      action: "demote",
      profileIds: ["a"],
      replacementId: "b",
    })
    expect(parseMembershipAction({ action: "remove", profileIds: ["a"] })).toEqual({ action: "remove", profileIds: ["a"] })
  })

  it("refuses unknown actions and empty lists", () => {
    expect(parseMembershipAction({ action: "delete", profileIds: ["a"] })).toBeNull()
    expect(parseMembershipAction({ action: "remove", profileIds: [] })).toBeNull()
    expect(parseMembershipAction(null)).toBeNull()
  })
})

describe("planMembershipChange", () => {
  it("moves a promoted employee out of Assessment Profiles and grants the Manager role", () => {
    const result = planMembershipChange({ ...base, request: { action: "promote", profileIds: ["emp1"] } })
    expect(result).toEqual({
      ok: true,
      plan: {
        insert: [{ profileId: "emp1", status: "management" }],
        remove: [{ profileId: "emp1", status: "assessment" }],
        grantManagerRole: ["emp1"],
        leavesNoManager: false,
      },
    })
  })

  it("doesn't grant the Manager role to someone who already has it", () => {
    const result = planMembershipChange({
      ...base,
      roleIdsByProfile: { emp1: [ROLE.employee, ROLE.manager] },
      request: { action: "promote", profileIds: ["emp1"] },
    })
    expect(result.ok && result.plan.grantManagerRole).toEqual([])
  })

  it("moves a removed manager back to Assessment Profiles and flags the missing manager", () => {
    const result = planMembershipChange({ ...base, request: { action: "demote", profileIds: ["mgr"], replacementId: null } })
    expect(result).toEqual({
      ok: true,
      plan: {
        insert: [{ profileId: "mgr", status: "assessment" }],
        remove: [{ profileId: "mgr", status: "management" }],
        grantManagerRole: [],
        leavesNoManager: true,
      },
    })
  })

  it("replaces a manager in one step", () => {
    const result = planMembershipChange({
      ...base,
      roleIdsByProfile: { emp2: [ROLE.manager] },
      request: { action: "demote", profileIds: ["mgr"], replacementId: "emp2" },
    })
    expect(result).toEqual({
      ok: true,
      plan: {
        insert: [
          { profileId: "mgr", status: "assessment" },
          { profileId: "emp2", status: "management" },
        ],
        remove: [
          { profileId: "mgr", status: "management" },
          { profileId: "emp2", status: "assessment" },
        ],
        grantManagerRole: [],
        leavesNoManager: false,
      },
    })
  })

  it("only accepts a replacement from this department's Assessment Profiles", () => {
    for (const replacementId of ["mgr", "outsider"]) {
      expect(
        planMembershipChange({ ...base, request: { action: "demote", profileIds: ["mgr"], replacementId } })
      ).toMatchObject({ ok: false, status: 400 })
    }
  })

  it("removes every row a person has in the department", () => {
    const dual: MembershipRow[] = [...rows, { profileId: "mgr", status: "assessment" }]
    const result = planMembershipChange({ ...base, rows: dual, request: { action: "remove", profileIds: ["mgr"] } })
    expect(result).toEqual({
      ok: true,
      plan: {
        insert: [],
        remove: [
          { profileId: "mgr", status: "management" },
          { profileId: "mgr", status: "assessment" },
        ],
        grantManagerRole: [],
        leavesNoManager: true,
      },
    })
  })

  it("doesn't flag a missing manager when nobody is left to manage", () => {
    const result = planMembershipChange({ ...base, request: { action: "remove", profileIds: ["mgr", "emp1", "emp2"] } })
    expect(result.ok && result.plan.leavesNoManager).toBe(false)
  })

  it("refuses stale, wrong-list, archived and closed-department requests", () => {
    expect(planMembershipChange({ ...base, request: { action: "remove", profileIds: ["gone"] } })).toMatchObject({ ok: false, status: 409 })
    expect(planMembershipChange({ ...base, request: { action: "promote", profileIds: ["mgr"] } })).toMatchObject({ ok: false, status: 409 })
    expect(
      planMembershipChange({ ...base, request: { action: "demote", profileIds: ["emp1"], replacementId: null } })
    ).toMatchObject({ ok: false, status: 409 })
    expect(
      planMembershipChange({ ...base, archivedProfileIds: ["emp1"], request: { action: "promote", profileIds: ["emp1"] } })
    ).toMatchObject({ ok: false, status: 409 })
    expect(
      planMembershipChange({ ...base, departmentClosed: true, request: { action: "remove", profileIds: ["emp1"] } })
    ).toMatchObject({ ok: false, status: 409 })
  })
})
