import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { resultsHref } from "@/lib/assessment/results-href"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

function BucketSection({
  title,
  rows,
  renderRow,
  emptyMessage,
}: {
  title: string
  rows: ManagerRow[]
  renderRow: (row: ManagerRow) => React.ReactNode
  emptyMessage: string
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title} <span className="text-muted-foreground font-normal">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="rounded-md border bg-card divide-y">{rows.map(renderRow)}</div>
      )}
    </section>
  )
}

/**
 * Four buckets derived from the same ManagerRow shape the Manager and
 * Capability-Owner dashboards already use (buildManagerRows) -- not a
 * separate status computation. "Missed" maps to assessmentStatus ===
 * "overdue"; the user's explicit addition to the originally requested
 * Active/Upcoming/Finished set.
 */
export function EmployeeAssessmentsClient({ rows }: { rows: ManagerRow[] }) {
  const upcoming = rows.filter((r) => r.assessmentStatus === "not_yet_open")
  const active = rows.filter((r) => r.assessmentStatus === "not_started" || r.assessmentStatus === "in_progress")
  // "closed" (an invalidated attempt) is finished too: it can't be retaken.
  const finished = rows.filter((r) => r.assessmentStatus === "completed" || r.assessmentStatus === "closed")
  const missed = rows.filter((r) => r.assessmentStatus === "overdue")

  return (
    <div className="p-6 max-w-3xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assessments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every assessment across your assigned capabilities.
        </p>
      </div>

      <BucketSection
        title="Active"
        rows={active}
        emptyMessage="Nothing to take right now."
        renderRow={(r) => (
          <Link
            key={`${r.profileId}:${r.capabilityId}`}
            href={`/protected/employee/assessment/${r.assessmentId}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <div>
              <p className="font-medium">{r.capabilityName}</p>
              <p className="text-sm text-muted-foreground">
                {r.deadline ? `Closes ${formatDate(r.deadline, true)}` : "No expiry"}
              </p>
            </div>
            <Badge variant="secondary">{r.assessmentStatus === "in_progress" ? "Resume" : "Start"}</Badge>
          </Link>
        )}
      />

      <BucketSection
        title="Upcoming"
        rows={upcoming}
        emptyMessage="No upcoming assessments."
        renderRow={(r) => (
          <div key={`${r.profileId}:${r.capabilityId}`} className="px-4 py-3">
            <p className="font-medium">{r.capabilityName}</p>
            <p className="text-sm text-muted-foreground">Not yet open.</p>
          </div>
        )}
      />

      <BucketSection
        title="Finished"
        rows={finished}
        emptyMessage="No finished assessments yet."
        renderRow={(r) => (
          <div key={`${r.profileId}:${r.capabilityId}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{r.capabilityName}</p>
              {r.assessmentStatus === "closed" ? (
                <p className="text-sm text-muted-foreground">
                  Attempt closed{r.completedAt ? ` ${formatDate(r.completedAt, true)}` : ""}. Contact your manager or
                  administrator if you need a retake.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {r.achievedTier ? r.achievedTier.label : "Completed"}
                  {r.completedAt ? ` · Completed ${formatDate(r.completedAt, true)}` : ""}
                </p>
              )}
            </div>
            {r.assessmentStatus === "closed" ? (
              <Badge variant="destructive">Closed</Badge>
            ) : resultsHref(r) ? (
              <Link
                href={resultsHref(r)!}
                className="text-sm font-medium underline-offset-4 hover:underline whitespace-nowrap"
              >
                View results
              </Link>
            ) : (
              <Badge variant="outline">Completed</Badge>
            )}
          </div>
        )}
      />

      <BucketSection
        title="Missed"
        rows={missed}
        emptyMessage="Nothing missed."
        renderRow={(r) => (
          <div key={`${r.profileId}:${r.capabilityId}`} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{r.capabilityName}</p>
              <p className="text-sm text-muted-foreground">
                Window closed {r.deadline ? formatDate(r.deadline, true) : "earlier"}.
              </p>
            </div>
            <Badge variant="destructive">Missed</Badge>
          </div>
        )}
      />
    </div>
  )
}
