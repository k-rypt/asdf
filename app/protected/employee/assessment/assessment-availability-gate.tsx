import { AssessmentClient } from "./assessment-client"
import { AssessmentMessage } from "./assessment-message"
import { formatDate } from "@/lib/utils"
import type { AssessmentWindowResult } from "@/lib/assessment/assessment-window"
import type { AttemptGate } from "@/lib/assessment/attempt-gate"
import Link from "next/link"

/**
 * UX gate, same category as employee/layout.tsx's role redirect --
 * requireEmployeeAssessmentClient (Call site 1) remains the actual
 * enforcement boundary for /api/assessments/start and everything else,
 * so a user who somehow reaches this page during not_yet/expired and
 * pokes the API directly still gets rejected server-side.
 */
export function AssessmentAvailabilityGate({
  userId,
  assessmentDefinitionId,
  windowResult,
  gate,
}: {
  userId: string
  assessmentDefinitionId: string
  windowResult: AssessmentWindowResult | null
  gate: AttemptGate
}) {
  // One attempt per assessment -- checked before the window, so a finished
  // employee sees that rather than "window closed". startSession enforces
  // the same rule server-side.
  if (gate.kind === "finished") {
    const when = gate.finishedAt ? ` on ${formatDate(gate.finishedAt, true)}` : ""
    return gate.status === "completed" ? (
      <AssessmentMessage title="You've already completed this assessment">
        You completed it{when}. Each assessment can be taken once.{" "}
        <Link href={`/protected/employee/results/${gate.attemptId}`} className="underline underline-offset-4">
          View your results
        </Link>
        .
      </AssessmentMessage>
    ) : gate.timeExpired ? (
      <AssessmentMessage title="Your time ran out">
        Your time for this assessment ran out{when}. Contact your manager or administrator if you need a retake.
      </AssessmentMessage>
    ) : (
      <AssessmentMessage title="This assessment is closed">
        Your attempt was closed{when}. Contact your manager or administrator if you need a retake.
      </AssessmentMessage>
    )
  }

  // null means there's no published assessment at all for this employee's
  // capability -- unchanged from today's behavior, AssessmentClient's own
  // API call surfaces that as an error.
  if (!windowResult || windowResult.state === "available") {
    return <AssessmentClient userId={userId} assessmentDefinitionId={assessmentDefinitionId} />
  }

  if (windowResult.state === "not_yet") {
    return (
      <AssessmentMessage title="Assessment not yet available">
        Opens {windowResult.effectiveFrom ? formatDate(windowResult.effectiveFrom, true) : "soon"}.
      </AssessmentMessage>
    )
  }

  return (
    <AssessmentMessage title="Your window has closed">
      Your window to take this assessment closed on{" "}
      {windowResult.effectiveUntil ? formatDate(windowResult.effectiveUntil, true) : "an earlier date"}. Contact your
      manager.
    </AssessmentMessage>
  )
}
