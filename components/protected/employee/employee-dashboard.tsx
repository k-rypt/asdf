import Link from "next/link"
import { ArrowRight, CalendarClock, CircleAlert, CircleCheck, ClipboardList, PartyPopper } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import { daysUntil, type EmployeeDashboardSummary } from "@/lib/assessment/employee-dashboard-summary"
import { resultsHref } from "@/lib/assessment/results-href"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

const ASSESSMENTS_HREF = "/protected/employee/assessments"

/** Deadlines this close get the amber "closes soon" treatment. */
const URGENT_DAYS = 3

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <Link href={ASSESSMENTS_HREF} className="group">
      <Card className="h-full transition-colors group-hover:bg-muted/50">
        <CardContent className="flex items-center gap-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function DeadlineBadge({ deadline, now }: { deadline: string; now: number }) {
  const days = daysUntil(deadline, now)
  const text = days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`
  return days <= URGENT_DAYS ? (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">{text}</Badge>
  ) : (
    <Badge variant="secondary">{text}</Badge>
  )
}

function UpNextCard({ row, now }: { row: ManagerRow | null; now: number }) {
  if (!row) {
    return (
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <PartyPopper className="size-6" />
          </div>
          <div>
            <p className="font-semibold">You&apos;re all caught up</p>
            <p className="text-sm text-muted-foreground">There&apos;s no assessment waiting for you right now.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const resuming = row.assessmentStatus === "in_progress"
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardDescription>Up next</CardDescription>
        <CardTitle className="text-xl">{row.capabilityName}</CardTitle>
        <CardAction>
          {row.deadline ? <DeadlineBadge deadline={row.deadline} now={now} /> : <Badge variant="outline">No expiry</Badge>}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {resuming
            ? "You have an attempt in progress. Its timer keeps running, so pick up where you left off."
            : "Take this assessment in one sitting. You get one attempt."}
          {row.deadline && (
            <>
              <br />
              Available until {formatDate(row.deadline, true)}.
            </>
          )}
        </p>
        <Button
          render={<Link href={`/protected/employee/assessment/${row.assessmentId}`} />}
          nativeButton={false}
          size="lg"
        >
          {resuming ? "Resume assessment" : "Start assessment"}
          <ArrowRight />
        </Button>
      </CardContent>
    </Card>
  )
}

function RecentResultsCard({ rows }: { rows: ManagerRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent results</CardTitle>
        <CardAction>
          <Link href={ASSESSMENTS_HREF} className="text-sm text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your results will appear here once you finish an assessment.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.capabilityId} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  {resultsHref(r) ? (
                    <Link href={resultsHref(r)!} className="block truncate font-medium underline-offset-4 hover:underline">
                      {r.capabilityName}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">{r.capabilityName}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {r.assessmentStatus === "closed"
                      ? "Contact your manager if you need a retake."
                      : r.completedAt
                        ? formatDate(r.completedAt)
                        : "Completed"}
                  </p>
                </div>
                {r.assessmentStatus === "closed" ? (
                  <Badge variant="destructive">Closed</Badge>
                ) : (
                  <Badge variant="outline">{r.achievedTier?.label ?? "Completed"}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function EmployeeDashboard({
  givenName,
  summary,
  now,
}: {
  givenName: string | null
  summary: EmployeeDashboardSummary
  now: number
}) {
  const today = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-sm text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back{givenName ? `, ${givenName}` : ""}</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="To do"
          value={summary.counts.toDo}
          icon={ClipboardList}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          label="Upcoming"
          value={summary.counts.upcoming}
          icon={CalendarClock}
          tone="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
        />
        <StatCard
          label="Completed"
          value={summary.counts.completed}
          icon={CircleCheck}
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
        />
        <StatCard
          label="Missed / Closed"
          value={summary.counts.missedOrClosed}
          icon={CircleAlert}
          tone="bg-destructive/10 text-destructive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <UpNextCard row={summary.upNext} now={now} />
        <RecentResultsCard rows={summary.recent} />
      </div>
    </div>
  )
}
