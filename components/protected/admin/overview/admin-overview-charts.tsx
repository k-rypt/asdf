"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  AXIS_TICK,
  COLORS,
  ChartCard,
  ChartTooltip,
  CompletionRateChart,
  DataTable,
  VIZ_VARS,
  type Series,
} from "@/components/protected/manager/team-stats-charts"
import type { CapabilityStats } from "@/lib/assessment/team-stats"
import type { WeekCount } from "@/lib/admin/overview-activity"

function WeeklyCompletionsChart({ weeks }: { weeks: WeekCount[] }) {
  const series: Series[] = [{ key: "completed", label: "Completed", color: COLORS.rate }]
  const total = weeks.reduce((sum, w) => sum + w.completed, 0)

  return (
    <ChartCard
      title="Completed assessments per week"
      description={`Last ${weeks.length} weeks, ${total} in total. The last bar is this week so far.`}
      empty={total === 0 ? `Nobody has completed an assessment in the last ${weeks.length} weeks.` : null}
      chart={
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => <ChartTooltip {...(props as object)} series={series} />}
            />
            <Bar dataKey="completed" fill={COLORS.rate} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable columns={["Week of", "Completed"]} rows={weeks.map((w) => [w.label, w.completed])} />
      }
    />
  )
}

export function AdminOverviewCharts({ weeks, stats }: { weeks: WeekCount[]; stats: CapabilityStats[] }) {
  return (
    <div className={`grid gap-6 lg:grid-cols-2 ${VIZ_VARS}`}>
      <WeeklyCompletionsChart weeks={weeks} />
      <CompletionRateChart stats={stats} emptyText="No assessments are open to anyone yet." />
    </div>
  )
}
