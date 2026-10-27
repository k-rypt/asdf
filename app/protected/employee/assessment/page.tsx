import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { computeAssessmentWindow, type AssessmentWindowResult } from "@/lib/assessment/assessment-window"
import { AssessmentAvailabilityGate } from "./assessment-availability-gate"
import { loadAttemptGate } from "@/lib/assessment/attempt-gate"
import { AssessmentMessage } from "./assessment-message"

export default async function AssessmentPage() {
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Duplicated here rather than calling requireEmployeeAssessmentClient
  // directly -- this is a page render, not a route handler, and the two
  // call sites need different failure shapes (a 404 JSON response vs. a
  // rendered state) even though they share the same window computation.
  const { data: capabilityRows } = await supabase
    .from("profile_capabilities")
    .select("capability_id, added_at")
    .eq("profile_id", user.id)
  const capabilityIds = (capabilityRows ?? []).map((row) => row.capability_id as number)

  let windowResult: AssessmentWindowResult | null = null
  let assessmentDefinitionId: string | null = null
  if (capabilityIds.length > 0) {
    const { data: assessmentRow } = await supabase
      .from("assessments")
      .select("id, capability_id, available_from, available_until")
      .in("capability_id", capabilityIds)
      .eq("status", "published")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (assessmentRow) {
      assessmentDefinitionId = String(assessmentRow.id)
      const addedAt = capabilityRows!.find((row) => row.capability_id === assessmentRow.capability_id)!
        .added_at as string
      windowResult = computeAssessmentWindow({
        availableFrom: assessmentRow.available_from,
        availableUntil: assessmentRow.available_until,
        addedAt,
      })
    }
  }

  if (!assessmentDefinitionId) {
    // Nothing resolved at all (no capability, or no published assessment)
    // -- AssessmentAvailabilityGate's existing `!windowResult` branch
    // already renders AssessmentClient unconditionally in that case today,
    // which would now crash without an id. Match the page's own existing
    // "nothing to assess" UX instead (same message style used elsewhere in
    // this file's sibling routes) rather than passing a fake id down.
    return (
      <AssessmentMessage title="No assessment available">
        You have no published assessment to take right now.
      </AssessmentMessage>
    )
  }

  const gate = await loadAttemptGate(supabase, user.id, Number(assessmentDefinitionId))

  return (
    <AssessmentAvailabilityGate
      userId={user.id}
      assessmentDefinitionId={assessmentDefinitionId}
      windowResult={windowResult}
      gate={gate}
    />
  )
}
