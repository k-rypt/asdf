import type { AttemptGate } from "./attempt-gate"
import type { AssessmentWindowState } from "./assessment-window"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

/**
 * Dashboard status for one employee/assessment pair. A finished attempt
 * wins over the window and overdue flag: completed stays completed, and an
 * invalidated attempt is "closed" -- not offered again as Active, and not
 * "missed" either, since the employee did take it.
 */
export function rowStatusFor(
  gate: AttemptGate,
  { overdue, windowState }: { overdue: boolean; windowState: AssessmentWindowState }
): ManagerRow["assessmentStatus"] {
  if (gate.kind === "finished") return gate.status === "completed" ? "completed" : "closed"
  if (overdue) return "overdue"
  if (windowState === "not_yet") return "not_yet_open"
  if (windowState === "expired") return "overdue"
  return gate.kind === "resume" ? "in_progress" : "not_started"
}
