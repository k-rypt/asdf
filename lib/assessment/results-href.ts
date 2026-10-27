import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

/**
 * Where an employee views a finished attempt's results, or null when there
 * are none to show -- only completed attempts were fully graded; a closed
 * (invalidated) one stopped part-way.
 */
export function resultsHref(row: Pick<ManagerRow, "assessmentStatus" | "attemptId">): string | null {
  if (row.assessmentStatus !== "completed" || row.attemptId == null) return null
  return `/protected/employee/results/${row.attemptId}`
}
