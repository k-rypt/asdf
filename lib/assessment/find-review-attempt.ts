import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * The completed attempt a reviewer's "View details" link points at. The
 * dashboard link carries the row's own attempt id; without one (older
 * links) it falls back to the latest completed attempt for this assessment
 * and person. Either way the attempt must match the assessment and person
 * in the URL, and be completed.
 */
export async function findReviewAttemptId(
  supabase: SupabaseClient,
  { assessmentId, profileId, attemptId }: { assessmentId: number; profileId: string; attemptId?: string }
): Promise<number | null> {
  let query = supabase
    .from("attempts")
    .select("id")
    .eq("assessment_id", assessmentId)
    .eq("profile_id", profileId)
    .eq("status", "completed")
  const numericAttemptId = Number(attemptId)
  if (attemptId && Number.isFinite(numericAttemptId)) query = query.eq("id", numericAttemptId)

  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle()
  return data ? (data.id as number) : null
}
