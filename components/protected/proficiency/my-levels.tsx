import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

/** One row per capability with a ladder result: current level, then past results in an expander. */
export function MyLevels({ rows }: { rows: ManagerRow[] }) {
  const leveled = rows.filter((r) => r.currentLevel)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">My levels</h2>
      {leveled.length === 0 ? (
        <p className="text-sm text-muted-foreground">No self-assessment results yet.</p>
      ) : (
        leveled.map((r) => {
          const current = r.currentLevel!
          const past = (r.levelHistory ?? []).slice(1)
          return (
            <div key={r.capabilityId} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.capabilityName}</span>
                <Badge variant="outline">{current.label}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDate(current.completedAt)} · {current.assessmentName}
              </span>
              {current.message && <span className="text-xs">{current.message}</span>}
              {past.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">History ({past.length})</summary>
                  <ol className="mt-1 flex flex-col gap-1">
                    {past.map((h) => (
                      <li key={h.attemptId} className="flex justify-between gap-2">
                        <span>{h.label}</span>
                        <span className="text-muted-foreground">
                          {formatDate(h.completedAt)} · {h.assessmentName}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
