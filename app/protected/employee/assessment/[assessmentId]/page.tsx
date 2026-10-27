import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { computeAssessmentWindow } from "@/lib/assessment/assessment-window"
import { AssessmentAvailabilityGate } from "../assessment-availability-gate"
import { loadAttemptGate } from "@/lib/assessment/attempt-gate"
import { AssessmentMessage } from "../assessment-message"
import { loadInProgressAssessmentIds, publishedOrInProgress } from "@/lib/assessment/resolvable-assessments"

interface PageProps {
  params: Promise<{ assessmentId: string }>
}

/**
 * Deep-linkable counterpart to ../page.tsx (the singular, implicit "first
 * published assessment" route, left unchanged for this plan -- see the
 * design spec's Deferred section). Resolves exactly the assessment named
 * in the URL, scoped to the employee's own capabilities -- not "the first
 * published one" -- so an employee with more than one capability's
 * assessment can take/resume either independently via its own link (see
 * the employee Assessments tab, app/protected/employee/assessments/page.tsx).
 */
function NotFound() {
  return (
    <AssessmentMessage title="Assessment not found">
      This assessment doesn&apos;t exist, or isn&apos;t one of your assigned capabilities.
    </AssessmentMessage>
  )
}

export default async function AssessmentByIdPage({ params }: PageProps) {
  const { assessmentId } = await params
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  // A non-numeric id would otherwise reach `.eq("id", NaN)` below, which
  // Postgres rejects on a numeric column (surfaces as a raw 500) rather
  // than the honest "not found" this page should show instead.
  // Final-review finding.
  const numericAssessmentId = Number(assessmentId)
  if (!Number.isFinite(numericAssessmentId)) {
    return <NotFound />
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: capabilityRows } = await supabase
    .from("profile_capabilities")
    .select("capability_id, added_at")
    .eq("profile_id", user.id)
  const capabilityIds = (capabilityRows ?? []).map((row) => row.capability_id as number)

  const { data: assessmentRow } = await supabase
    .from("assessments")
    .select("id, capability_id, available_from, available_until")
    .eq("id", numericAssessmentId)
    .in("capability_id", capabilityIds)
    // A replaced version stays open to someone mid-attempt on it.
    .or(publishedOrInProgress(await loadInProgressAssessmentIds(supabase, user.id)))
    .maybeSingle()

  // An id outside the employee's own capabilities (or that simply doesn't
  // exist) previously fell through to AssessmentAvailabilityGate with a
  // null windowResult, which renders AssessmentClient and lets its API
  // call surface a generic error. A direct not-found render here is
  // clearer and doesn't depend on the client's error copy. Final-review
  // finding.
  if (!assessmentRow) {
    return <NotFound />
  }

  const addedAt = capabilityRows!.find((row) => row.capability_id === assessmentRow.capability_id)!
    .added_at as string
  const windowResult = computeAssessmentWindow({
    availableFrom: assessmentRow.available_from,
    availableUntil: assessmentRow.available_until,
    addedAt,
  })

  const gate = await loadAttemptGate(supabase, user.id, numericAssessmentId)

  return (
    <AssessmentAvailabilityGate
      userId={user.id}
      assessmentDefinitionId={assessmentId}
      windowResult={windowResult}
      gate={gate}
    />
  )
}
