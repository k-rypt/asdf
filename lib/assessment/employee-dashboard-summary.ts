import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

export interface EmployeeDashboardSummary {
  counts: { toDo: number; upcoming: number; completed: number; missedOrClosed: number }
  /** The one assessment to act on now, or null when there's nothing to take. */
  upNext: ManagerRow | null
  /** Up to three finished rows (completed or closed), newest first. */
  recent: ManagerRow[]
}

const isToDo = (r: ManagerRow) => r.assessmentStatus === "not_started" || r.assessmentStatus === "in_progress"
const isFinished = (r: ManagerRow) => r.assessmentStatus === "completed" || r.assessmentStatus === "closed"

/**
 * Overview-page summary over the same rows the My Assessments tab buckets
 * (buildManagerRows). Up next: an in-progress attempt first (its timer is
 * running), then the soonest deadline; no-expiry assessments sort last.
 */
export function summarizeEmployeeRows(rows: ManagerRow[]): EmployeeDashboardSummary {
  const toDo = rows.filter(isToDo)
  const finished = rows.filter(isFinished)

  const upNext =
    [...toDo].sort((a, b) => {
      if (a.assessmentStatus !== b.assessmentStatus) return a.assessmentStatus === "in_progress" ? -1 : 1
      if (a.deadline === b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    })[0] ?? null

  const recent = [...finished]
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 3)

  return {
    counts: {
      toDo: toDo.length,
      upcoming: rows.filter((r) => r.assessmentStatus === "not_yet_open").length,
      completed: rows.filter((r) => r.assessmentStatus === "completed").length,
      missedOrClosed: rows.filter((r) => r.assessmentStatus === "overdue" || r.assessmentStatus === "closed").length,
    },
    upNext,
    recent,
  }
}

/** Whole days left until a deadline, rounding a partial day up; 0 once it has passed. */
export function daysUntil(deadline: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 86_400_000))
}
