import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  EDITABLE_ASSESSMENT_STATUSES,
  LEVEL_COLUMNS,
  canSyncTiers,
  planTierSnapshot,
  rowToLevel,
  type LadderLevel,
} from "@/lib/assessment/ladder"

export async function loadLadder(supabase: SupabaseClient, capabilityId: number): Promise<LadderLevel[]> {
  const { data, error } = await supabase
    .from("capability_ladder_levels")
    .select(LEVEL_COLUMNS)
    .eq("capability_id", capabilityId)
    .order("sfia_level", { ascending: true })
  if (error) throw new Error(`Failed to load the ladder: ${error.message}`)
  return (data ?? []).map(rowToLevel)
}

/**
 * Re-copies the capability ladder into this assessment's assessment_tiers,
 * for exactly the levels its yes/no questions use. Published (and any
 * other non-editable) assessments are left alone, so a ladder edit never
 * changes what someone is being scored against. Returns the levels its
 * questions use that the ladder doesn't define.
 */
export async function syncAssessmentTiers(
  supabase: SupabaseClient,
  assessmentId: number,
  ladderOverride?: LadderLevel[]
): Promise<{ synced: boolean; missingLevels: number[] }> {
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, capability_id, status")
    .eq("id", assessmentId)
    .maybeSingle()
  if (assessmentError) throw new Error(`Failed to load assessment: ${assessmentError.message}`)
  if (!assessment || assessment.capability_id == null || !canSyncTiers(assessment.status)) {
    return { synced: false, missingLevels: [] }
  }

  const { data: links, error: linksError } = await supabase
    .from("assessment_questions")
    .select("questions!inner(type, sfia_level)")
    .eq("assessment_id", assessmentId)
    .eq("questions.type", "yes_no")
  if (linksError) throw new Error(`Failed to load ladder questions: ${linksError.message}`)
  const usedLevels = (links ?? [])
    .map((l) => {
      const q = (Array.isArray(l.questions) ? l.questions[0] : l.questions) as { sfia_level: number | null } | null
      return q?.sfia_level ?? null
    })
    .filter((v): v is number => v != null)

  const ladder = ladderOverride ?? (await loadLadder(supabase, assessment.capability_id as number))
  const { rows, missingLevels } = planTierSnapshot(assessmentId, ladder, usedLevels)

  // Upsert then delete only stale tiers: there is never a moment with zero tiers, and repeated syncs are idempotent.
  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("assessment_tiers")
      .upsert(rows, { onConflict: "assessment_id,sfia_level" })
    if (upsertError) throw new Error(`Failed to copy the ladder: ${upsertError.message}`)
  }
  const levels = rows.map((r) => r.sfia_level)
  let staleQuery = supabase.from("assessment_tiers").delete().eq("assessment_id", assessmentId)
  if (levels.length > 0) staleQuery = staleQuery.not("sfia_level", "in", `(${levels.join(",")})`)
  const { error: deleteError } = await staleQuery
  if (deleteError) throw new Error(`Failed to clear stale assessment tiers: ${deleteError.message}`)
  return { synced: true, missingLevels }
}

/**
 * After a ladder edit: re-copy into every still-editable assessment of the capability.
 * Tries every draft; returns the ids that failed.
 */
export async function syncCapabilityDrafts(
  supabase: SupabaseClient,
  capabilityId: number
): Promise<{ failedAssessmentIds: number[] }> {
  const { data, error } = await supabase
    .from("assessments")
    .select("id")
    .eq("capability_id", capabilityId)
    .in("status", [...EDITABLE_ASSESSMENT_STATUSES])
  if (error) throw new Error(`Failed to load draft assessments: ${error.message}`)
  const ladder = await loadLadder(supabase, capabilityId)
  const failedAssessmentIds: number[] = []
  for (const a of data ?? []) {
    const id = a.id as number
    try {
      await syncAssessmentTiers(supabase, id, ladder)
    } catch (err) {
      console.error(`Tier sync failed for assessment ${id}: ${err instanceof Error ? err.message : String(err)}`)
      failedAssessmentIds.push(id)
    }
  }
  return { failedAssessmentIds }
}
