import Link from "next/link"
import { CircleAlert, CircleCheck, ClipboardCheck, Library, TriangleAlert, Users, ChevronRight, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { OverviewSummary } from "@/lib/admin/overview-summary"
import type { ActivityEvent, WeekCount } from "@/lib/admin/overview-activity"
import type { CapabilityStats } from "@/lib/assessment/team-stats"
import { AdminOverviewCharts } from "./admin-overview-charts"
import { RecentActivity } from "./recent-activity"

function StatCard({
  href,
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  href: string
  label: string
  value: number
  detail: string
  icon: React.ComponentType<{ className?: string }>
  tone: string
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center gap-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="size-5" />
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function AdminOverview({
  summary,
  weeks,
  stats,
  activity,
  now,
}: {
  summary: OverviewSummary
  weeks: WeekCount[]
  stats: CapabilityStats[]
  activity: ActivityEvent[]
  now: number
}) {
  const { users, capabilities, assessments, pendingApprovals, attention } = summary

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">What needs your attention across the organisation.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          href="/protected/admin/users"
          label="Active users"
          value={users.active}
          detail={`${users.employees} employees · ${users.managers} managers · ${users.owners} owners · ${users.admins} admins`}
          icon={Users}
          tone="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
        />
        <StatCard
          href="/protected/admin/capabilities"
          label="Active capabilities"
          value={capabilities.active}
          detail={`${capabilities.noOwner} without an owner · ${capabilities.noPreset} without a preset`}
          icon={Library}
          tone="bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
        />
        <StatCard
          href="/protected/admin/assessments"
          label="Assessments in progress"
          value={assessments.inProgress}
          detail={`${assessments.completedThisMonth} completed this month`}
          icon={Activity}
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
        />
        <StatCard
          href="/protected/admin/approvals"
          label="Pending approvals"
          value={pendingApprovals}
          detail={pendingApprovals === 0 ? "Nothing waiting" : "Presets awaiting a decision"}
          icon={ClipboardCheck}
          tone="bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>
            {attention.length === 0
              ? "Everything looks good."
              : `${attention.length} ${attention.length === 1 ? "item" : "items"} to look at, most urgent first.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <CircleCheck className="size-5 text-emerald-600" />
              No problems found across users, capabilities, departments or approvals.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {attention.map((item) => {
                const Icon = item.tone === "critical" ? CircleAlert : TriangleAlert
                return (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50">
                      <Icon
                        className={`size-5 shrink-0 ${item.tone === "critical" ? "text-destructive" : "text-amber-600"}`}
                        aria-label={item.tone === "critical" ? "Urgent" : "Warning"}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AdminOverviewCharts weeks={weeks} stats={stats} />

      <RecentActivity events={activity} now={now} />
    </div>
  )
}
