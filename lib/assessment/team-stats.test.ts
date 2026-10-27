import { describe, expect, it } from "vitest"
import { levelsByCapability, matchesStatusFilter, statsByCapability, teamCounts } from "./team-stats"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

const row = (
  capabilityId: number,
  assessmentStatus: ManagerRow["assessmentStatus"],
  extra: Partial<ManagerRow> = {}
): ManagerRow => ({
  profileId: `p${Math.random()}`,
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

describe("teamCounts", () => {
  it("counts each status group, folding closed in with overdue", () => {
    expect(
      teamCounts([
        row(1, "completed"),
        row(1, "completed"),
        row(1, "in_progress"),
        row(1, "not_started"),
        row(1, "overdue"),
        row(1, "closed"),
        row(1, "not_yet_open"),
      ])
    ).toEqual({
      total: 6,
      completed: 2,
      inProgress: 1,
      notStarted: 1,
      overdueClosed: 2,
      notYetOpen: 1,
      completionRate: 2 / 6,
    })
  })

  it("leaves not-yet-open assignments out of the completion rate", () => {
    expect(teamCounts([row(1, "completed"), row(1, "not_yet_open")]).completionRate).toBe(1)
  })

  it("has no completion rate when nothing is open yet", () => {
    expect(teamCounts([row(1, "not_yet_open")]).completionRate).toBeNull()
    expect(teamCounts([]).completionRate).toBeNull()
  })
})

describe("matchesStatusFilter", () => {
  it("matches everything for all", () => {
    expect(matchesStatusFilter("closed", "all")).toBe(true)
  })

  it("groups overdue and closed together", () => {
    expect(matchesStatusFilter("overdue", "overdue_closed")).toBe(true)
    expect(matchesStatusFilter("closed", "overdue_closed")).toBe(true)
    expect(matchesStatusFilter("completed", "overdue_closed")).toBe(false)
  })
})

describe("statsByCapability", () => {
  it("gives each capability its counts, lowest completion rate first", () => {
    const stats = statsByCapability([
      row(1, "completed"),
      row(1, "completed"),
      row(2, "completed"),
      row(2, "not_started"),
      row(3, "not_yet_open"),
    ])
    expect(stats.map((s) => [s.capabilityId, s.completionRate])).toEqual([
      [2, 0.5],
      [1, 1],
      [3, null],
    ])
    expect(stats[0]).toMatchObject({ capabilityName: "Capability 2", total: 2, completed: 1, notStarted: 1 })
  })
})

describe("levelsByCapability", () => {
  it("counts levels reached among completed attempts, levels in ascending order", () => {
    const p3 = { sfiaLevel: 3, label: "P3 -- Apply" }
    const p2 = { sfiaLevel: 2, label: "P2 -- Assist" }
    const result = levelsByCapability([
      row(1, "completed", { achievedTier: p3 }),
      row(1, "completed", { achievedTier: p2 }),
      row(1, "completed", { achievedTier: p3 }),
      row(1, "completed"),
      row(1, "in_progress", { achievedTier: p3 }),
      row(2, "not_started"),
    ])
    expect(result.levels).toEqual([p2, p3])
    expect(result.capabilities).toEqual([
      { capabilityId: 1, capabilityName: "Capability 1", noLevel: 1, byLevel: { 2: 1, 3: 2 } },
    ])
  })

  it("counts someone whose only level is from an older assessment", () => {
    const old = { sfiaLevel: 2, label: "P2 -- Assist", message: null, completedAt: "2026-01-01T00:00:00Z", assessmentName: "Old", attemptId: 1 }
    const result = levelsByCapability([row(1, "not_started", { currentLevel: old })])
    expect(result.levels).toEqual([{ sfiaLevel: 2, label: "P2 -- Assist" }])
    expect(result.capabilities).toEqual([{ capabilityId: 1, capabilityName: "Capability 1", noLevel: 0, byLevel: { 2: 1 } }])
  })
})
