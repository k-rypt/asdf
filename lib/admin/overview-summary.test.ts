import { describe, expect, it } from "vitest"
import { buildOverviewSummary, type OverviewInput } from "./overview-summary"

const empty: OverviewInput = {
  profiles: [],
  capabilities: [],
  departments: [],
  assignments: [],
  pendingApprovals: 0,
  completedThisMonth: 0,
}

const cap = { id: 1, name: "SQL", status: "active", ownerId: "owner-1", currentPreset: 5 }

describe("buildOverviewSummary", () => {
  it("raises nothing for a healthy setup", () => {
    const summary = buildOverviewSummary({
      ...empty,
      profiles: [{ id: "a", roleIds: [1] }],
      capabilities: [cap],
      departments: [{ id: 9, name: "Ops", status: "active", managers: 1, employees: 2 }],
      assignments: [{ capabilityId: 1, assessmentId: 3, status: "completed" }],
    })
    expect(summary.attention).toEqual([])
  })

  it("counts users by role, a person with two roles in both", () => {
    const summary = buildOverviewSummary({
      ...empty,
      profiles: [
        { id: "a", roleIds: [1] },
        { id: "b", roleIds: [2, 4] },
        { id: "c", roleIds: [3] },
      ],
    })
    expect(summary.users).toEqual({ active: 3, admins: 1, managers: 1, owners: 1, employees: 1 })
  })

  it("groups overdue employees per capability", () => {
    const summary = buildOverviewSummary({
      ...empty,
      capabilities: [cap],
      assignments: [
        { capabilityId: 1, assessmentId: 3, status: "overdue" },
        { capabilityId: 1, assessmentId: 3, status: "overdue" },
        { capabilityId: 1, assessmentId: 3, status: "in_progress" },
      ],
    })
    expect(summary.attention.map((a) => a.title)).toEqual(["2 employees overdue on SQL"])
    expect(summary.assessments.inProgress).toBe(1)
  })

  it("flags assigned employees with nothing published", () => {
    const summary = buildOverviewSummary({
      ...empty,
      capabilities: [cap],
      assignments: [{ capabilityId: 1, assessmentId: null, status: "not_yet_open" }],
    })
    expect(summary.attention[0]).toMatchObject({ key: "no-assessment-1", tone: "critical" })
  })

  it("flags missing owner and preset on active capabilities only", () => {
    const summary = buildOverviewSummary({
      ...empty,
      capabilities: [
        { id: 1, name: "SQL", status: "active", ownerId: null, currentPreset: null },
        { id: 2, name: "Old", status: "archived", ownerId: null, currentPreset: null },
      ],
    })
    expect(summary.attention.map((a) => a.key)).toEqual(["no-owner-1", "no-preset-1"])
    expect(summary.capabilities).toEqual({ active: 1, noOwner: 1, noPreset: 1 })
  })

  it("flags open departments with employees but no manager", () => {
    const summary = buildOverviewSummary({
      ...empty,
      departments: [
        { id: 1, name: "Ops", status: "active", managers: 0, employees: 3 },
        { id: 2, name: "Gone", status: "closed", managers: 0, employees: 3 },
        { id: 3, name: "Empty", status: "active", managers: 0, employees: 0 },
      ],
    })
    expect(summary.attention.map((a) => a.title)).toEqual(["Ops has no manager"])
  })

  it("flags pending approvals and users without a role, singular wording", () => {
    const summary = buildOverviewSummary({
      ...empty,
      profiles: [{ id: "x", roleIds: [] }],
      pendingApprovals: 1,
    })
    expect(summary.attention.map((a) => a.title)).toEqual(["1 preset awaiting approval", "1 user has no role"])
  })

  it("puts overdue first, then approvals", () => {
    const summary = buildOverviewSummary({
      ...empty,
      capabilities: [{ ...cap, ownerId: null }],
      assignments: [{ capabilityId: 1, assessmentId: 3, status: "overdue" }],
      pendingApprovals: 2,
    })
    expect(summary.attention.map((a) => a.key)).toEqual(["overdue-1", "approvals", "no-owner-1"])
  })
})
