/**
 * Schedule conflict detection and launch blocking validation.
 * 
 * In campaign scheduling, assessments must have disjoint (non-overlapping)
 * availability windows. Two scheduled assessments collide when:
 *   startA < endB && endA > startB
 * 
 * If any schedule conflict is detected, campaign launch is strictly blocked.
 */

export interface SchedulableAssessment {
  id: number
  name: string
  status?: string | null
  available_from?: string | null
  available_until?: string | null
}

export interface ScheduleConflict<T extends SchedulableAssessment = SchedulableAssessment> {
  assessmentA: T
  assessmentB: T
  message: string
}

export interface ConflictDetectionResult<T extends SchedulableAssessment = SchedulableAssessment> {
  conflicts: ScheduleConflict<T>[]
  conflictIdSet: Set<number>
  hasConflicts: boolean
}

/**
 * Validates whether an assessment module has been approved.
 * In this system, approved assessments have status 'published' or 'approved'.
 */
export function isAssessmentApproved(status?: string | null): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === "published" || s === "approved"
}

/**
 * Validates whether an assessment can be applied to a target campaign.
 * Must be approved, and not already applied to another campaign.
 */
export function canApplyAssessmentToCampaign(
  assessment: {
    id: number
    status?: string | null
    campaign_id?: number | null
  },
  targetCampaignId: number
): { canApply: boolean; reason?: string } {
  if (!isAssessmentApproved(assessment.status)) {
    return {
      canApply: false,
      reason: "Assessment module must be approved before adding to a campaign.",
    }
  }

  if (
    assessment.campaign_id !== null &&
    assessment.campaign_id !== undefined &&
    assessment.campaign_id !== targetCampaignId
  ) {
    return {
      canApply: false,
      reason:
        "Assessment is already applied to another campaign. A capability assessment can only be applied once.",
    }
  }

  return { canApply: true }
}

/**
 * Finds capability IDs that appear more than once in the assessments list.
 * A capability assessment can only be applied once per campaign.
 */
export function findDuplicateCapabilityIds(
  assessments: Array<{ id: number; capability_id?: number | null }>
): number[] {
  const seen = new Set<number>()
  const duplicates = new Set<number>()

  for (const a of assessments) {
    if (a.capability_id) {
      if (seen.has(a.capability_id)) {
        duplicates.add(a.capability_id)
      } else {
        seen.add(a.capability_id)
      }
    }
  }

  return Array.from(duplicates)
}

/**
 * Detects schedule overlaps across a list of assessments.
 * Unscheduled assessments (missing start or end) are ignored.
 */
export function detectScheduleConflicts<T extends SchedulableAssessment>(
  assessments: T[]
): ConflictDetectionResult<T> {
  const scheduled = assessments.filter(
    (a) => a.available_from && a.available_until
  )
  const conflicts: ScheduleConflict<T>[] = []
  const conflictIdSet = new Set<number>()

  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i]
      const b = scheduled[j]
      const startA = new Date(a.available_from!).getTime()
      const endA = new Date(a.available_until!).getTime()
      const startB = new Date(b.available_from!).getTime()
      const endB = new Date(b.available_until!).getTime()

      // Standard interval overlap condition
      if (startA < endB && endA > startB) {
        conflicts.push({
          assessmentA: a,
          assessmentB: b,
          message: `"${a.name}" overlaps with "${b.name}"`,
        })
        conflictIdSet.add(a.id)
        conflictIdSet.add(b.id)
      }
    }
  }

  return {
    conflicts,
    conflictIdSet,
    hasConflicts: conflicts.length > 0,
  }
}

/**
 * Validates whether a campaign is allowed to be launched.
 * Blocked if any schedule conflicts exist, unapproved modules exist, duplicate capabilities exist, expired schedules exist, or readiness checklist is incomplete.
 */
export function canLaunchCampaign(
  hasConflicts: boolean,
  isReady: boolean = true,
  allApproved: boolean = true,
  hasDuplicateCapabilities: boolean = false,
  hasExpiredSchedules: boolean = false
): {
  canLaunch: boolean
  reason?: string
} {
  if (hasConflicts) {
    return {
      canLaunch: false,
      reason: "Campaign cannot be launched: all schedule conflicts must be resolved first.",
    }
  }
  if (!allApproved) {
    return {
      canLaunch: false,
      reason: "Campaign cannot be launched: all connected assessment modules must be approved first.",
    }
  }
  if (hasDuplicateCapabilities) {
    return {
      canLaunch: false,
      reason:
        "Campaign cannot be launched: multiple assessments share the same capability. A capability assessment can only be applied once per campaign.",
    }
  }
  if (hasExpiredSchedules) {
    return {
      canLaunch: false,
      reason:
        "Campaign cannot be launched: one or more assessment schedules have already passed. Update schedules or shift them to start now.",
    }
  }
  if (!isReady) {
    return {
      canLaunch: false,
      reason: "Campaign cannot be launched: readiness checklist incomplete.",
    }
  }
  return { canLaunch: true }
}

export interface ScheduleTimelinessResult<T extends SchedulableAssessment = SchedulableAssessment> {
  hasExpired: boolean
  hasPartiallyElapsed: boolean
  expiredAssessments: T[]
  partiallyElapsedAssessments: T[]
  allUpToDate: boolean
  earliestPastStart: string | null
}

/**
 * Checks if any scheduled assessment has an availability window that has already expired
 * or partially elapsed relative to a reference time (default: now).
 */
export function checkScheduleTimeliness<T extends SchedulableAssessment>(
  assessments: T[],
  now: Date = new Date()
): ScheduleTimelinessResult<T> {
  const nowMs = now.getTime()
  const expired: T[] = []
  const partiallyElapsed: T[] = []
  let earliestPastStartMs: number | null = null

  for (const a of assessments) {
    if (!a.available_from || !a.available_until) continue
    const startMs = new Date(a.available_from).getTime()
    const endMs = new Date(a.available_until).getTime()

    if (endMs <= nowMs) {
      expired.push(a)
    } else if (startMs < nowMs && endMs > nowMs) {
      partiallyElapsed.push(a)
    }

    if (startMs < nowMs) {
      if (earliestPastStartMs === null || startMs < earliestPastStartMs) {
        earliestPastStartMs = startMs
      }
    }
  }

  return {
    hasExpired: expired.length > 0,
    hasPartiallyElapsed: partiallyElapsed.length > 0,
    expiredAssessments: expired,
    partiallyElapsedAssessments: partiallyElapsed,
    allUpToDate: expired.length === 0,
    earliestPastStart: earliestPastStartMs ? new Date(earliestPastStartMs).toISOString() : null,
  }
}

export interface ShiftedScheduleResult {
  id: number
  available_from: string
  available_until: string
  shiftedMinutes: number
}

/**
 * Calculates a forward time shift for all scheduled assessments in a campaign,
 * moving the earliest scheduled assessment to targetStartTime (default: now) while
 * preserving exact assessment durations, gaps, and non-overlapping sequence.
 */
export function computeCascadeShiftedSchedules(
  assessments: SchedulableAssessment[],
  targetStartTime: Date = new Date()
): ShiftedScheduleResult[] {
  const scheduled = assessments.filter((a) => a.available_from && a.available_until)
  if (scheduled.length === 0) return []

  const starts = scheduled.map((a) => new Date(a.available_from!).getTime())
  const minStart = Math.min(...starts)
  const targetMs = targetStartTime.getTime()

  // Only shift forward if target is after the current earliest start
  const deltaMs = Math.max(0, targetMs - minStart)
  const deltaMinutes = Math.round(deltaMs / 60_000)

  return scheduled.map((a) => {
    const origStart = new Date(a.available_from!).getTime()
    const origEnd = new Date(a.available_until!).getTime()
    const newStart = new Date(origStart + deltaMs).toISOString()
    const newEnd = new Date(origEnd + deltaMs).toISOString()

    return {
      id: a.id,
      available_from: newStart,
      available_until: newEnd,
      shiftedMinutes: deltaMinutes,
    }
  })
}
