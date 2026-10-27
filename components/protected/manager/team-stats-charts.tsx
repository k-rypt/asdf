"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CapabilityStats, LevelBreakdown } from "@/lib/assessment/team-stats"

/*
 * Chart colors, validated with the dataviz palette checker (CVD and
 * normal-vision separation pass for adjacent stacked segments). Status
 * segments use the status palette; levels are one blue ramp, light -> dark
 * as the level rises. Not-started amber sits under 3:1 contrast on the
 * surface, so every chart also has a legend and a table view.
 */
export const COLORS = {
  rate: "var(--viz-blue)",
  completed: "#0ca30c",
  inProgress: "var(--viz-blue)",
  notStarted: "var(--viz-amber)",
  overdueClosed: "#d03b3b",
  noLevel: "var(--viz-neutral)",
}
export const VIZ_VARS =
  "[--viz-blue:#2a78d6] [--viz-amber:#eda100] [--viz-neutral:#c3c2b7] dark:[--viz-blue:#3987e5] dark:[--viz-amber:#c98500] dark:[--viz-neutral:#626260]"

/** Ordinal blue ramp from step 250 (#86b6ef) to step 650 (#104281), one step per level. */
function levelColor(index: number, count: number): string {
  if (count <= 1) return "#3987e5"
  return `color-mix(in oklch, #104281 ${Math.round((index / (count - 1)) * 100)}%, #86b6ef)`
}

export const ROW_HEIGHT = 44
export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 }

export interface Series {
  key: string
  label: string
  color: string
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
}: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number }[]
  label?: string
  series: Series[]
  format?: (key: string, value: number) => string
}) {
  if (!active || !payload?.length) return null
  const values = new Map(payload.map((p) => [String(p.dataKey), Number(p.value ?? 0)]))
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <ul className="space-y-0.5">
        {series
          .filter((s) => values.has(s.key))
          .map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">
                {format ? format(s.key, values.get(s.key)!) : values.get(s.key)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((cell, i) => (
                <td key={i} className={`px-3 py-2 ${i > 0 ? "text-right tabular-nums" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ChartCard({
  title,
  description,
  empty,
  legend,
  chart,
  table,
}: {
  title: string
  description: string
  empty: string | null
  legend?: Series[]
  chart: React.ReactNode
  table: React.ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {!empty && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Show as chart" : "Show as table"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : showTable ? (
          table
        ) : (
          <>
            {legend && <Legend series={legend} />}
            {chart}
          </>
        )}
      </CardContent>
    </Card>
  )
}

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`)

export function CompletionRateChart({
  stats,
  emptyText = "No assessments are open for your team yet.",
}: {
  stats: CapabilityStats[]
  emptyText?: string
}) {
  const data = stats
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, ratePct: Math.round((s.completionRate ?? 0) * 100) }))
  const series: Series[] = [{ key: "ratePct", label: "Completion rate", color: COLORS.rate }]

  return (
    <ChartCard
      title="Completion rate by capability"
      description="Share of open assignments completed, lowest first."
      empty={data.length === 0 ? emptyText : null}
      chart={
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 40}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 110, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis type="category" dataKey="capabilityName" width={140} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => (
                <ChartTooltip
                  {...(props as object)}
                  series={series}
                  format={(_, v) => {
                    const s = data.find((d) => d.ratePct === v)
                    return s ? `${v}% · ${s.completed} of ${s.total}` : `${v}%`
                  }}
                />
              )}
            />
            <Bar dataKey="ratePct" fill={COLORS.rate} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
              <LabelList
                dataKey="ratePct"
                position="right"
                className="fill-foreground text-xs"
                formatter={(v) => {
                  const s = data.find((d) => d.ratePct === Number(v))
                  return s ? `${v}% · ${s.completed} of ${s.total}` : `${v}%`
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          columns={["Capability", "Completed", "Open assignments", "Rate"]}
          rows={data.map((s) => [s.capabilityName, s.completed, s.total, pct(s.completionRate)])}
        />
      }
    />
  )
}

function StatusChart({ stats }: { stats: CapabilityStats[] }) {
  const data = stats.filter((s) => s.total > 0)
  const series: Series[] = [
    { key: "completed", label: "Completed", color: COLORS.completed },
    { key: "inProgress", label: "In progress", color: COLORS.inProgress },
    { key: "notStarted", label: "Not started", color: COLORS.notStarted },
    { key: "overdueClosed", label: "Overdue / Closed", color: COLORS.overdueClosed },
  ]

  return (
    <ChartCard
      title="Status by capability"
      description="Where each capability's open assignments stand."
      empty={data.length === 0 ? "No assessments are open for your team yet." : null}
      legend={series}
      chart={
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 40}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="capabilityName" width={140} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => <ChartTooltip {...(props as object)} series={series} />}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="status"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                barSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          columns={["Capability", ...series.map((s) => s.label)]}
          rows={data.map((s) => [s.capabilityName, s.completed, s.inProgress, s.notStarted, s.overdueClosed])}
        />
      }
    />
  )
}

function LevelsChart({ breakdown }: { breakdown: LevelBreakdown }) {
  const { levels, capabilities } = breakdown
  const series: Series[] = [
    ...(capabilities.some((c) => c.noLevel > 0)
      ? [{ key: "noLevel", label: "No level reached", color: COLORS.noLevel }]
      : []),
    ...levels.map((l, i) => ({ key: `level_${l.sfiaLevel}`, label: l.label, color: levelColor(i, levels.length) })),
  ]
  const data = capabilities.map((c) => ({
    capabilityName: c.capabilityName,
    noLevel: c.noLevel,
    ...Object.fromEntries(levels.map((l) => [`level_${l.sfiaLevel}`, c.byLevel[l.sfiaLevel] ?? 0])),
  }))

  return (
    <ChartCard
      title="Results: levels achieved"
      description="Completed assessments by the level each person reached."
      empty={data.length === 0 ? "No one on your team has completed an assessment yet." : null}
      legend={series}
      chart={
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 40}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="capabilityName" width={140} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => <ChartTooltip {...(props as object)} series={series} />}
            />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="levels"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                barSize={20}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <DataTable
          columns={["Capability", ...series.map((s) => s.label)]}
          rows={capabilities.map((c) => [
            c.capabilityName,
            ...series.map((s) => (s.key === "noLevel" ? c.noLevel : c.byLevel[Number(s.key.slice(6))] ?? 0)),
          ])}
        />
      }
    />
  )
}

export function TeamStatsCharts({ stats, levels }: { stats: CapabilityStats[]; levels: LevelBreakdown }) {
  return (
    <div className={`mx-auto w-full max-w-5xl space-y-6 p-6 ${VIZ_VARS}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How your direct reports are doing, by capability. Assessments that aren&apos;t open yet are left out.
        </p>
      </div>
      <CompletionRateChart stats={stats} />
      <StatusChart stats={stats} />
      <LevelsChart breakdown={levels} />
    </div>
  )
}
