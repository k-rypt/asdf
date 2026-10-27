import type { SupabaseClient } from "@supabase/supabase-js"

/** Assessments this employee has an in-progress attempt on. */
export async function loadInProgressAssessmentIds(supabase: SupabaseClient, profileId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("attempts")
    .select("assessment_id")
    .eq("profile_id", profileId)
    .eq("status", "in_progress")
  if (error) throw new Error(`Failed to load in-progress attempts: ${error.message}`)
  return (data ?? []).map((row) => row.assessment_id as number)
}

/**
 * PostgREST `.or()` filter for the assessments an employee can reach: the
 * published ones, plus any they're mid-attempt on. Publishing a new
 * version archives the old one, but someone already taking it finishes on
 * the version they started.
 */
export function publishedOrInProgress(inProgressAssessmentIds: number[]): string {
  return inProgressAssessmentIds.length > 0
    ? `status.eq.published,id.in.(${inProgressAssessmentIds.join(",")})`
    : "status.eq.published"
}
