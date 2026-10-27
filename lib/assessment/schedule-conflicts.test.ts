import { describe, expect, it } from "vitest"
import {
  detectScheduleConflicts,
  canLaunchCampaign,
  isAssessmentApproved,
  canApplyAssessmentToCampaign,
  findDuplicateCapabilityIds,
  checkScheduleTimeliness,
  computeCascadeShiftedSchedules,
  SchedulableAssessment,
} from "./schedule-conflicts"

describe("detectScheduleConflicts", () => {
  it("returns zero conflicts when assessments are completely non-overlapping", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Module A",
        available_from: "2026-11-01T09:00:00Z",
        available_until: "2026-11-01T12:00:00Z",
      },
      {
        id: 2,
        name: "Module B",
        available_from: "2026-11-01T13:00:00Z",
        available_until: "2026-11-01T17:00:00Z",
      },
    ]

    const result = detectScheduleConflicts(assessments)
    expect(result.hasConflicts).toBe(false)
    expect(result.conflicts).toHaveLength(0)
    expect(result.conflictIdSet.size).toBe(0)
  })

  it("detects an overlap when startA < endB and endA > startB", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 10,
        name: "Backend Assessment",
        available_from: "2026-11-01T10:00:00Z",
        available_until: "2026-11-01T14:00:00Z",
      },
      {
        id: 20,
        name: "Frontend Assessment",
        available_from: "2026-11-01T12:00:00Z",
        available_until: "2026-11-01T16:00:00Z",
      },
    ]

    const result = detectScheduleConflicts(assessments)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].message).toBe('"Backend Assessment" overlaps with "Frontend Assessment"')
    expect(result.conflictIdSet.has(10)).toBe(true)
    expect(result.conflictIdSet.has(20)).toBe(true)
  })

  it("detects subset encapsulation (one assessment completely inside another)", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Outer Assessment",
        available_from: "2026-11-01T08:00:00Z",
        available_until: "2026-11-01T18:00:00Z",
      },
      {
        id: 2,
        name: "Inner Assessment",
        available_from: "2026-11-01T10:00:00Z",
        available_until: "2026-11-01T12:00:00Z",
      },
    ]

    const result = detectScheduleConflicts(assessments)
    expect(result.hasConflicts).toBe(true)
    expect(result.conflicts).toHaveLength(1)
  })

  it("ignores unscheduled assessments that lack available_from or available_until", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Scheduled",
        available_from: "2026-11-01T09:00:00Z",
        available_until: "2026-11-01T12:00:00Z",
      },
      {
        id: 2,
        name: "Unscheduled A",
        available_from: null,
        available_until: null,
      },
      {
        id: 3,
        name: "Unscheduled B",
        available_from: "2026-11-01T10:00:00Z",
        available_until: null,
      },
    ]

    const result = detectScheduleConflicts(assessments)
    expect(result.hasConflicts).toBe(false)
    expect(result.conflicts).toHaveLength(0)
  })

  it("permits back-to-back abutting times where endA === startB", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Slot 1",
        available_from: "2026-11-01T09:00:00Z",
        available_until: "2026-11-01T12:00:00Z",
      },
      {
        id: 2,
        name: "Slot 2",
        available_from: "2026-11-01T12:00:00Z",
        available_until: "2026-11-01T15:00:00Z",
      },
    ]

    // Abutting boundary: startA < endB (9 < 15) BUT endA > startB (12 > 12 is false)
    const result = detectScheduleConflicts(assessments)
    expect(result.hasConflicts).toBe(false)
  })
})

describe("isAssessmentApproved", () => {
  it("returns true for published and approved statuses", () => {
    expect(isAssessmentApproved("published")).toBe(true)
    expect(isAssessmentApproved("PUBLISHED")).toBe(true)
    expect(isAssessmentApproved("approved")).toBe(true)
    expect(isAssessmentApproved("Approved")).toBe(true)
  })

  it("returns false for draft, pending_approval, rejected, archived, or null", () => {
    expect(isAssessmentApproved("draft")).toBe(false)
    expect(isAssessmentApproved("pending_approval")).toBe(false)
    expect(isAssessmentApproved("rejected")).toBe(false)
    expect(isAssessmentApproved("archived")).toBe(false)
    expect(isAssessmentApproved(null)).toBe(false)
    expect(isAssessmentApproved(undefined)).toBe(false)
    expect(isAssessmentApproved("")).toBe(false)
  })
})

describe("canLaunchCampaign", () => {
  it("blocks launch if hasConflicts is true", () => {
    const check = canLaunchCampaign(true, true)
    expect(check.canLaunch).toBe(false)
    expect(check.reason).toContain("conflicts must be resolved")
  })

  it("blocks launch if not ready even without conflicts", () => {
    const check = canLaunchCampaign(false, false)
    expect(check.canLaunch).toBe(false)
    expect(check.reason).toContain("readiness checklist incomplete")
  })

  it("blocks launch if unapproved modules exist", () => {
    const check = canLaunchCampaign(false, true, false)
    expect(check.canLaunch).toBe(false)
    expect(check.reason).toContain("all connected assessment modules must be approved first")
  })

  it("blocks launch if duplicate capabilities exist", () => {
    const check = canLaunchCampaign(false, true, true, true)
    expect(check.canLaunch).toBe(false)
    expect(check.reason).toContain("multiple assessments share the same capability")
  })

  it("blocks launch if expired schedules exist", () => {
    const check = canLaunchCampaign(false, true, true, false, true)
    expect(check.canLaunch).toBe(false)
    expect(check.reason).toContain("one or more assessment schedules have already passed")
  })

  it("permits launch when conflict-free, ready, and all approved without duplicate capabilities or expired schedules", () => {
    const check = canLaunchCampaign(false, true, true, false, false)
    expect(check.canLaunch).toBe(true)
    expect(check.reason).toBeUndefined()
  })
})

describe("canApplyAssessmentToCampaign", () => {
  it("permits approved assessment with null campaign_id", () => {
    const res = canApplyAssessmentToCampaign(
      { id: 1, status: "published", campaign_id: null },
      10
    )
    expect(res.canApply).toBe(true)
  })

  it("permits approved assessment that already belongs to target campaign", () => {
    const res = canApplyAssessmentToCampaign(
      { id: 1, status: "published", campaign_id: 10 },
      10
    )
    expect(res.canApply).toBe(true)
  })

  it("blocks unapproved assessment", () => {
    const res = canApplyAssessmentToCampaign(
      { id: 1, status: "draft", campaign_id: null },
      10
    )
    expect(res.canApply).toBe(false)
    expect(res.reason).toContain("must be approved")
  })

  it("blocks assessment already applied to another campaign", () => {
    const res = canApplyAssessmentToCampaign(
      { id: 1, status: "published", campaign_id: 99 },
      10
    )
    expect(res.canApply).toBe(false)
    expect(res.reason).toContain("already applied to another campaign")
  })
})

describe("findDuplicateCapabilityIds", () => {
  it("returns empty array when all capabilities are distinct", () => {
    const list = [
      { id: 1, capability_id: 101 },
      { id: 2, capability_id: 102 },
      { id: 3, capability_id: 103 },
    ]
    expect(findDuplicateCapabilityIds(list)).toEqual([])
  })

  it("returns duplicate capability IDs when multiple assessments share a capability", () => {
    const list = [
      { id: 1, capability_id: 101 },
      { id: 2, capability_id: 102 },
      { id: 3, capability_id: 101 },
      { id: 4, capability_id: 102 },
      { id: 5, capability_id: 105 },
    ]
    expect(findDuplicateCapabilityIds(list)).toEqual([101, 102])
  })

  it("ignores items with null or undefined capability_id", () => {
    const list = [
      { id: 1, capability_id: null },
      { id: 2, capability_id: null },
      { id: 3, capability_id: 101 },
    ]
    expect(findDuplicateCapabilityIds(list)).toEqual([])
  })
})

describe("checkScheduleTimeliness", () => {
  const referenceNow = new Date("2026-10-21T12:00:00Z")

  it("identifies fully expired assessments where available_until <= now", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Past Module",
        available_from: "2026-10-20T09:00:00Z",
        available_until: "2026-10-20T17:00:00Z",
      },
      {
        id: 2,
        name: "Future Module",
        available_from: "2026-10-22T09:00:00Z",
        available_until: "2026-10-22T17:00:00Z",
      },
    ]

    const result = checkScheduleTimeliness(assessments, referenceNow)
    expect(result.hasExpired).toBe(true)
    expect(result.expiredAssessments).toHaveLength(1)
    expect(result.expiredAssessments[0].id).toBe(1)
    expect(result.allUpToDate).toBe(false)
  })

  it("identifies partially elapsed assessments where start < now < end", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Running Module",
        available_from: "2026-10-21T09:00:00Z",
        available_until: "2026-10-21T17:00:00Z",
      },
    ]

    const result = checkScheduleTimeliness(assessments, referenceNow)
    expect(result.hasExpired).toBe(false)
    expect(result.hasPartiallyElapsed).toBe(true)
    expect(result.partiallyElapsedAssessments).toHaveLength(1)
    expect(result.allUpToDate).toBe(true)
  })

  it("reports allUpToDate when all scheduled modules are in the future", () => {
    const assessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Tomorrow Module",
        available_from: "2026-10-22T09:00:00Z",
        available_until: "2026-10-22T17:00:00Z",
      },
    ]

    const result = checkScheduleTimeliness(assessments, referenceNow)
    expect(result.hasExpired).toBe(false)
    expect(result.hasPartiallyElapsed).toBe(false)
    expect(result.allUpToDate).toBe(true)
  })
})

describe("computeCascadeShiftedSchedules", () => {
  it("shifts all scheduled assessments forward preserving durations and spacing", () => {
    const pastAssessments: SchedulableAssessment[] = [
      {
        id: 1,
        name: "Module 1",
        available_from: "2026-10-10T09:00:00Z",
        available_until: "2026-10-10T12:00:00Z", // 3h duration
      },
      {
        id: 2,
        name: "Module 2",
        available_from: "2026-10-10T14:00:00Z", // 2h gap
        available_until: "2026-10-10T16:00:00Z", // 2h duration
      },
    ]

    const targetStart = new Date("2026-10-21T09:00:00Z") // 11 days forward
    const shifted = computeCascadeShiftedSchedules(pastAssessments, targetStart)

    expect(shifted).toHaveLength(2)
    expect(shifted[0].available_from).toBe("2026-10-21T09:00:00.000Z")
    expect(shifted[0].available_until).toBe("2026-10-21T12:00:00.000Z")

    expect(shifted[1].available_from).toBe("2026-10-21T14:00:00.000Z")
    expect(shifted[1].available_until).toBe("2026-10-21T16:00:00.000Z")

    expect(shifted[0].shiftedMinutes).toBe(11 * 24 * 60)
  })

  it("returns empty array when no assessments are scheduled", () => {
    const unscheduled: SchedulableAssessment[] = [
      { id: 1, name: "Unscheduled", available_from: null, available_until: null },
    ]
    expect(computeCascadeShiftedSchedules(unscheduled)).toEqual([])
  })
})
