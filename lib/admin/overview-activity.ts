export interface WeekCount {
  /** ISO date (yyyy-mm-dd) of the week's Monday, local time. */
  weekStart: string
  /** e.g. "Oct 13". */
  label: string
  completed: number
}

function mondayOf(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Monday of the earliest week `weeklyCompletions` counts, for the query's lower bound. */
export function weeksWindowStart(weeks: number, now: Date = new Date()): Date {
  const start = mondayOf(now)
  start.setDate(start.getDate() - 7 * (weeks - 1))
  return start
}

/**
 * Pure, no I/O. Completed attempts per Monday-start week, oldest first,
 * ending with the current week. Weeks with nothing are kept as zero so the
 * chart shows quiet stretches instead of skipping them.
 */
export function weeklyCompletions(completedAt: string[], weeks: number, now: Date = new Date()): WeekCount[] {
  const start = weeksWindowStart(weeks, now)
  const buckets: WeekCount[] = []
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + 7 * i)
    buckets.push({
      weekStart: isoDate(d),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d),
      completed: 0,
    })
  }
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]))
  for (const at of completedAt) {
    const i = index.get(isoDate(mondayOf(new Date(at))))
    if (i !== undefined) buckets[i].completed++
  }
  return buckets
}

export type ActivityKind = "completed" | "submitted" | "approved" | "rejected" | "opened" | "joined"

export interface ActivityEvent {
  key: string
  kind: ActivityKind
  at: string
  text: string
  href: string | null
}

/** Pure, no I/O. Newest first across every source, capped at `limit`; future-dated events are dropped. */
export function recentActivity(events: ActivityEvent[], limit: number, now: Date = new Date()): ActivityEvent[] {
  return events
    .filter((e) => new Date(e.at).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}
