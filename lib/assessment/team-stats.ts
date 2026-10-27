import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

type Status = ManagerRow["assessmentStatus"]

export type StatusFilter = "all" | "completed" | "in_progress" | "not_started" | "overdue_closed" | "not_yet_open"

export function matchesStatusFilter(status: Status, filter: StatusFilter): boolean {
  if (filter === "all") return true
  if (filter === "overdue_closed") return status === "overdue" || status === "closed"
  return status === filter
}

export interface TeamCounts {
  /** Assignments that are open or past -- everything except not-yet-open. */
  total: number
  completed: number
  inProgress: number
  notStarted: number
  overdueClosed: number
  notYetOpen: number
  /** completed / total, or null when nothing is open yet. */
  completionRate: number | null
}

/**
 * Team-level counts over the manager dashboard rows. Not-yet-open
 * assignments (including capabilities with no published assessment) can't
 * be taken yet, so they sit outside the completion rate rather than
 * dragging it down.
 */
export function teamCounts(rows: ManagerRow[]): TeamCounts {
  const count = (filter: StatusFilter) => rows.filter((r) => matchesStatusFilter(r.assessmentStatus, filter)).length
  const notYetOpen = count("not_yet_open")
  const total = rows.length - notYetOpen
  const completed = count("completed")
  return {
    total,
    completed,
    inProgress: count("in_progress"),
    notStarted: count("not_started"),
    overdueClosed: count("overdue_closed"),
    notYetOpen,
    completionRate: total > 0 ? completed / total : null,
  }
}

export interface CapabilityStats extends TeamCounts {
  capabilityId: number
  capabilityName: string
}

/** Per-capability counts, lowest completion rate first (problem areas on top); not-yet-open-only capabilities last. */
export function statsByCapability(rows: ManagerRow[]): CapabilityStats[] {
  return groupByCapability(rows)
    .map(({ capabilityId, capabilityName, rows: group }) => ({ capabilityId, capabilityName, ...teamCounts(group) }))
    .sort((a, b) => {
      if (a.completionRate === null || b.completionRate === null) {
        return a.completionRate === b.completionRate ? 0 : a.completionRate === null ? 1 : -1
      }
      return a.completionRate - b.completionRate || a.capabilityName.localeCompare(b.capabilityName)
    })
}

export interface LevelBreakdown {
  /** Every level reached by anyone, lowest first. */
  levels: { sfiaLevel: number; label: string }[]
  /** Capabilities with at least one completed attempt. */
  capabilities: {
    capabilityId: number
    capabilityName: string
    /** Completed without reaching any level. */
    noLevel: number
    byLevel: Record<number, number>
  }[]
}

/** Current levels per capability (latest ladder result from any assessment). */
/** Current level from any assessment; falls back to this assessment's result when rows weren't built with history. */
const levelOf = (r: ManagerRow) =>
  r.currentLevel ?? (r.assessmentStatus === "completed" ? r.achievedTier ?? null : null)

export function levelsByCapability(rows: ManagerRow[]): LevelBreakdown {
  const counted = rows.filter((r) => levelOf(r) || r.assessmentStatus === "completed")

  const levelLabels = new Map<number, string>()
  for (const r of counted) {
    const level = levelOf(r)
    if (level) levelLabels.set(level.sfiaLevel, level.label)
  }
  const levels = Array.from(levelLabels, ([sfiaLevel, label]) => ({ sfiaLevel, label })).sort(
    (a, b) => a.sfiaLevel - b.sfiaLevel
  )

  const capabilities = groupByCapability(counted).map(({ capabilityId, capabilityName, rows: group }) => {
    const byLevel: Record<number, number> = {}
    let noLevel = 0
    for (const r of group) {
      const level = levelOf(r)
      if (level) byLevel[level.sfiaLevel] = (byLevel[level.sfiaLevel] ?? 0) + 1
      else noLevel++
    }
    return { capabilityId, capabilityName, noLevel, byLevel }
  })

  return { levels, capabilities }
}

function groupByCapability(rows: ManagerRow[]) {
  const groups = new Map<number, { capabilityId: number; capabilityName: string; rows: ManagerRow[] }>()
  for (const r of rows) {
    const group = groups.get(r.capabilityId) ?? { capabilityId: r.capabilityId, capabilityName: r.capabilityName, rows: [] }
    group.rows.push(r)
    groups.set(r.capabilityId, group)
  }
  return Array.from(groups.values())
}
