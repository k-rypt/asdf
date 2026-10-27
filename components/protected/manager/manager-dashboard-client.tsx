"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, Clock, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { LevelHistoryDialog } from "@/components/protected/proficiency/level-history-dialog"
import type { LevelResult } from "@/lib/assessment/proficiency"
import { matchesStatusFilter, teamCounts, type StatusFilter } from "@/lib/assessment/team-stats"

export interface ManagerRow {
  profileId: string
  givenName: string
  lastName: string
  email: string
  capabilityId: number
  capabilityName: string
  /** assessments.id -- null when no published assessment exists for this capability assignment at all. */
  assessmentId: number | null
  assessmentStatus: "not_yet_open" | "not_started" | "in_progress" | "completed" | "closed" | "overdue"
  deadline: string | null
  achievedTier?: { sfiaLevel: number; label: string } | null
  /** Newest finished ladder result for this capability, from any of its assessments. */
  currentLevel?: LevelResult | null
  levelHistory?: LevelResult[]
  /** attempts.completed_at -- null unless assessmentStatus is "completed" or "closed". */
  completedAt: string | null
  /** attempts.id the status reflects -- null when there's no attempt yet. */
  attemptId: number | null
}

const STATUS_LABEL: Record<ManagerRow["assessmentStatus"], string> = {
  not_yet_open: "Not yet open",
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
  overdue: "Overdue",
}

const STATUS_VARIANT: Record<ManagerRow["assessmentStatus"], "outline" | "secondary" | "destructive"> = {
  not_yet_open: "outline",
  not_started: "secondary",
  in_progress: "secondary",
  completed: "outline",
  closed: "destructive",
  overdue: "destructive",
}

type SortOrder = "name_asc" | "name_desc" | "deadline"

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "overdue_closed", label: "Overdue / Closed" },
  { value: "not_yet_open", label: "Not yet open" },
]

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: string
  detail?: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="text-left">
      <Card className={`h-full transition-colors hover:bg-muted/50 ${active ? "ring-2 ring-primary" : ""}`}>
        <CardContent className="flex items-center gap-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
          </div>
        </CardContent>
      </Card>
    </button>
  )
}

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without this, the closed
// trigger shows e.g. "name_asc" instead of "Name (A-Z)".
const SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "name_asc", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "deadline", label: "Deadline" },
]

/**
 * Patterned on department_members_client.tsx's table/search/sort
 * conventions, but read-only -- no bulk actions, no transfer/close
 * dialogs. This page's job is visibility into direct reports' assessment
 * progress, not membership management (that stays admin-only via the
 * existing department pages).
 */
export function ManagerDashboardClient({
  rows,
  detailHrefBase,
  detailHrefSuffix = "review",
  backHref,
  backLabel,
  title = "Your Team",
  subtitle = "Assessment progress for your direct reports, one row per capability assignment.",
}: {
  rows: ManagerRow[]
  /** e.g. "/protected/manager/assessments" or "/protected/capability/9/assessments" -- "View details" links to `${detailHrefBase}/${assessmentId}/${detailHrefSuffix}`. Omit to hide the column entirely (no caller currently omits it, but keeps this component usable without the feature if needed later). */
  detailHrefBase?: string
  /**
   * Defaults to "review". The capability caller passes "attempt-review"
   * instead -- app/protected/capability/[capability]/assessments/[assessmentId]/review/page.tsx
   * already owns the plain "review" leaf path for a different feature
   * (reviewing an assessment's question content), so the attempt-detail
   * page this link points to lives at a distinct "attempt-review" path.
   * See that attempt-review page.tsx's own doc comment for the full story.
   */
  detailHrefSuffix?: string
  /**
   * When set, a back link is rendered above the heading. The capability
   * surface passes the capability page it came from -- without it there was
   * no way back once you opened employee progress. The manager's own
   * Overview page omits this (it is the top of that tree).
   */
  backHref?: string
  backLabel?: string
  /** Overridable so the capability surface can name the capability it is showing. */
  title?: string
  subtitle?: string
}) {
  const [search, setSearch] = useState("")
  const [sortOrder, setSortOrder] = useState<SortOrder>("name_asc")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const counts = useMemo(() => teamCounts(rows), [rows])
  // A card click filters to its status; clicking the active card clears it.
  const toggleFilter = (filter: StatusFilter) => setStatusFilter((f) => (f === filter ? "all" : filter))

  const visible = useMemo(() => {
    let list = rows.filter((r) => matchesStatusFilter(r.assessmentStatus, statusFilter))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (r) =>
          `${r.givenName} ${r.lastName}`.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.capabilityName.toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    if (sortOrder === "name_asc") {
      sorted.sort((a, b) => `${a.givenName} ${a.lastName}`.localeCompare(`${b.givenName} ${b.lastName}`))
    } else if (sortOrder === "name_desc") {
      sorted.sort((a, b) => `${b.givenName} ${b.lastName}`.localeCompare(`${a.givenName} ${a.lastName}`))
    } else {
      // Soonest first; no expiry last.
      sorted.sort((a, b) => (a.deadline && b.deadline ? a.deadline.localeCompare(b.deadline) : a.deadline ? -1 : b.deadline ? 1 : 0))
    }
    return sorted
  }, [rows, search, sortOrder, statusFilter])

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel ?? "Back"}
        </Link>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Completion rate"
          value={counts.completionRate === null ? "—" : `${Math.round(counts.completionRate * 100)}%`}
          detail={`${counts.completed} of ${counts.total} assignments`}
          icon={CircleCheck}
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
          active={statusFilter === "completed"}
          onClick={() => toggleFilter("completed")}
        />
        <StatCard
          label="In progress"
          value={String(counts.inProgress)}
          icon={Clock}
          tone="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
          active={statusFilter === "in_progress"}
          onClick={() => toggleFilter("in_progress")}
        />
        <StatCard
          label="Not started"
          value={String(counts.notStarted)}
          icon={CircleDashed}
          tone="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
          active={statusFilter === "not_started"}
          onClick={() => toggleFilter("not_started")}
        />
        <StatCard
          label="Overdue / Closed"
          value={String(counts.overdueClosed)}
          icon={CircleAlert}
          tone="bg-destructive/10 text-destructive"
          active={statusFilter === "overdue_closed"}
          onClick={() => toggleFilter("overdue_closed")}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          items={STATUS_FILTER_OPTIONS}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)} items={SORT_ORDER_OPTIONS}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_ORDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Capability</th>
              <th className="px-4 py-3 font-medium">Assessment Status</th>
              <th className="px-4 py-3 font-medium">Current level</th>
              <th className="px-4 py-3 font-medium">Deadline</th>
              <th className="px-4 py-3 font-medium">Completed</th>
              {detailHrefBase && <th className="px-4 py-3 font-medium">Details</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={detailHrefBase ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "No direct reports found." : "No rows match your search or filter."}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={`${r.profileId}:${r.capabilityId}`} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {r.givenName} {r.lastName}
                  </td>
                  <td className="px-4 py-3">{r.email}</td>
                  <td className="px-4 py-3">{r.capabilityName}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[r.assessmentStatus]}>{STATUS_LABEL[r.assessmentStatus]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.currentLevel ? (
                      <LevelHistoryDialog
                        title={`${r.givenName} ${r.lastName} · ${r.capabilityName}`}
                        current={r.currentLevel}
                        history={r.levelHistory ?? [r.currentLevel]}
                        showAsOf={r.currentLevel.attemptId !== r.attemptId}
                      />
                    ) : r.achievedTier ? (
                      <Badge variant="outline">{r.achievedTier.label}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.deadline ? formatDate(r.deadline, true) : "No expiry"}</td>
                  <td className="px-4 py-3">
                    {r.assessmentStatus === "completed" && r.completedAt ? (
                      formatDate(r.completedAt, true)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {detailHrefBase && (
                    <td className="px-4 py-3">
                      {r.assessmentStatus === "completed" && r.assessmentId != null ? (
                        <Link
                          href={`${detailHrefBase}/${r.assessmentId}/${detailHrefSuffix}?profileId=${r.profileId}${r.attemptId != null ? `&attemptId=${r.attemptId}` : ""}`}
                          className="text-sm underline underline-offset-2"
                        >
                          View details
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
