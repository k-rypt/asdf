import type { AssessmentWindowState } from "./assessment-window"

export type ReminderType = "upcoming" | "active_started" | "active_midpoint" | "active_due_soon"

const DUE_SOON_MS = 24 * 60 * 60 * 1000

export interface DetermineNewlyDueRemindersParams {
  state: AssessmentWindowState
  effectiveFrom: string | null
  effectiveUntil: string | null
  addedAt: string
  alreadyFired: Set<ReminderType>
  now: Date
}

/**
 * Which of the four window-based reminder types are newly due for one
 * employee/assessment pair, given what has already fired. Pure, no I/O --
 * mirrors computeAssessmentWindow's own shape so the cron route can pass
 * its result straight through. `effectiveFrom ?? addedAt` is the
 * midpoint/due-soon start reference: effectiveFrom is null exactly when
 * the assessment has no availableFrom gate (available immediately), in
 * which case the employee's own assignment date is the only meaningful
 * "start" to measure a midpoint from.
 */
export function determineNewlyDueReminders(params: DetermineNewlyDueRemindersParams): ReminderType[] {
  const due: ReminderType[] = []
  const fire = (type: ReminderType) => {
    if (!params.alreadyFired.has(type)) due.push(type)
  }

  if (params.state === "not_yet") {
    fire("upcoming")
    return due
  }

  if (params.state === "available") {
    fire("active_started")
    if (params.effectiveUntil != null) {
      const start = new Date(params.effectiveFrom ?? params.addedAt).getTime()
      const end = new Date(params.effectiveUntil).getTime()
      const midpoint = start + (end - start) / 2
      if (params.now.getTime() >= midpoint) fire("active_midpoint")
      if (params.now.getTime() >= end - DUE_SOON_MS) fire("active_due_soon")
    }
  }

  // state === "expired": no new window reminders. The separate
  // assessment_deadline_flags/"Missed" mechanism already covers the
  // overdue case for the employee; this feature doesn't duplicate it.
  return due
}
