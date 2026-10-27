import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeAssessmentWindow } from "./assessment-window"

export interface DeadlineCandidate {
  assessmentId: number
  profileId: string
  capabilityId: number
  availableFrom: string | null
  availableUntil: string | null
  addedAt: string
}

/**
 * Computes each candidate's window, and for every one that's `expired`
 * with no completed attempt, upserts a row into assessment_deadline_flags.
 * `on conflict (assessment_id, profile_id) do nothing` makes repeat calls
 * (from either the manager page or the capability-owner page, possibly on
 * the very same employee/assessment pair) a no-op for pairs already
 * flagged -- see the spec's "Deadline-flag upsert mechanism".
 */
export async function flagOverdueAssessments(
  supabase: SupabaseClient,
  candidates: DeadlineCandidate[]
): Promise<void> {
  const expired = candidates.filter(
    (c) =>
      computeAssessmentWindow({
        availableFrom: c.availableFrom,
        availableUntil: c.availableUntil,
        addedAt: c.addedAt,
      }).state === "expired"
  )
  if (expired.length === 0) return

  const assessmentIds = Array.from(new Set(expired.map((c) => c.assessmentId)))
  const profileIds = Array.from(new Set(expired.map((c) => c.profileId)))

  const { data: completedAttempts, error: attemptsError } = await supabase
    .from("attempts")
    .select("assessment_id, profile_id")
    .in("assessment_id", assessmentIds)
    .in("profile_id", profileIds)
    .eq("status", "completed")

  // A failed read must never be treated as "nobody completed" -- that
  // would flag completed employees as overdue, and the flag is
  // permanent (unique + on conflict do nothing, nothing ever deletes a
  // row here). Bail out and let the next page load retry instead.
  // Final-review finding: this is exactly the failure mode the missing
  // manager SELECT policy on attempts hit before
  // 2026-09-29_manager_can_view_reports_attempts.sql.
  if (attemptsError) return

  const completedKeys = new Set(
    (completedAttempts ?? []).map((a) => `${a.assessment_id}:${a.profile_id}`)
  )

  const toFlag = expired
    .filter((c) => !completedKeys.has(`${c.assessmentId}:${c.profileId}`))
    .map((c) => ({
      assessment_id: c.assessmentId,
      profile_id: c.profileId,
      capability_id: c.capabilityId,
    }))
  if (toFlag.length === 0) return

  const { error: upsertError } = await supabase
    .from("assessment_deadline_flags")
    .upsert(toFlag, { onConflict: "assessment_id,profile_id", ignoreDuplicates: true })
  if (upsertError) {
    console.error("flagOverdueAssessments: upsert failed", upsertError)
  }
}
