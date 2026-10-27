import { describe, expect, it } from "vitest"
import { daysUntil, summarizeEmployeeRows } from "./employee-dashboard-summary"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

const row = (
  capabilityId: number,
  assessmentStatus: ManagerRow["assessmentStatus"],
  extra: Partial<ManagerRow> = {}
): ManagerRow => ({
  profileId: "p1",
  givenName: "Ana",
  lastName: "Cruz",
  email: "ana@example.com",
  capabilityId,
  capabilityName: `Capability ${capabilityId}`,
  assessmentId: capabilityId * 10,
  assessmentStatus,
  deadline: null,
  achievedTier: null,
  completedAt: null,
  attemptId: null,
  ...extra,
})

describe("summarizeEmployeeRows", () => {
  it("counts each bucket, folding closed attempts in with missed", () => {
    const summary = summarizeEmployeeRows([
      row(1, "not_started"),
      row(2, "in_progress"),
      row(3, "not_yet_open"),
      row(4, "completed"),
      row(5, "closed"),
      row(6, "overdue"),
    ])
    expect(summary.counts).toEqual({ toDo: 2, upcoming: 1, completed: 1, missedOrClosed: 2 })
  })

  it("picks an in-progress assessment as up next over one closing sooner", () => {
    const summary = summarizeEmployeeRows([
      row(1, "not_started", { deadline: "2026-10-16T00:00:00Z" }),
      row(2, "in_progress", { deadline: "2026-10-30T00:00:00Z" }),
    ])
    expect(summary.upNext?.capabilityId).toBe(2)
  })

  it("otherwise picks the one closing soonest, with no-expiry ones last", () => {
    const summary = summarizeEmployeeRows([
      row(1, "not_started"),
      row(2, "not_started", { deadline: "2026-10-30T00:00:00Z" }),
      row(3, "not_started", { deadline: "2026-10-20T00:00:00Z" }),
    ])
    expect(summary.upNext?.capabilityId).toBe(3)
  })

  it("has nothing up next when no assessment can be taken", () => {
    expect(summarizeEmployeeRows([row(1, "completed"), row(2, "not_yet_open")]).upNext).toBeNull()
  })

  it("lists the three most recently finished, newest first", () => {
    const summary = summarizeEmployeeRows([
      row(1, "completed", { completedAt: "2026-10-01T00:00:00Z" }),
      row(2, "closed", { completedAt: "2026-10-05T00:00:00Z" }),
      row(3, "completed", { completedAt: "2026-10-03T00:00:00Z" }),
      row(4, "completed", { completedAt: "2026-10-04T00:00:00Z" }),
      row(5, "overdue"),
    ])
    expect(summary.recent.map((r) => r.capabilityId)).toEqual([2, 4, 3])
  })
})

describe("daysUntil", () => {
  const now = new Date("2026-10-15T12:00:00Z").getTime()

  it("rounds a partial day up", () => {
    expect(daysUntil("2026-10-17T00:00:00Z", now)).toBe(2)
  })

  it("is zero once the deadline has passed", () => {
    expect(daysUntil("2026-10-14T00:00:00Z", now)).toBe(0)
  })
})
