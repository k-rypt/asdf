import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { syncAssessmentTiers } from "@/lib/assessment/sync-assessment-tiers"

export interface BuildAssessmentSuccess {
  ok: true
  assessmentId: number
  questionIds: string[]
  /** Yes/no levels the capability ladder has no entry for yet. */
  missingLadderLevels: number[]
}

export interface BuildAssessmentFailure {
  ok: false
  status: number
  error: string
}

/**
 * Extracted from app/api/admin/capabilities/[capability]/presets/
 * [presetId]/build-assessment/route.ts so the approve route
 * (presets/[presetId]/approve/route.ts) can call it directly instead of
 * issuing an internal HTTP request. Behavior-preserving extraction -- no
 * logic changes.
 */
export async function buildAssessmentFromPreset(
  supabase: SupabaseClient,
  params: { capabilityId: string; presetId: string; userId: string }
): Promise<BuildAssessmentSuccess | BuildAssessmentFailure> {
  const { capabilityId, presetId, userId } = params

  const { data: preset, error: presetError } = await supabase
    .from("question_presets")
    .select("id, capability_id, name, description, duration_minutes, passing_score, question_type_mix")
    .eq("id", presetId)
    .single()
  if (presetError || !preset) {
    throw new Error(presetError?.message ?? "Preset not found.")
  }
  if (String(preset.capability_id) !== String(capabilityId)) {
    return { ok: false, status: 400, error: "Preset does not belong to this capability." }
  }

  const { data: links, error: linksError } = await supabase
    .from("question_preset_questions")
    .select("question_id, position")
    .eq("preset_id", presetId)
    .order("position", { ascending: true })
  if (linksError) throw new Error(`Failed to load preset questions: ${linksError.message}`)
  if (!links || links.length === 0) {
    return { ok: false, status: 400, error: "This preset has no questions to build from." }
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .insert({
      capability_id: capabilityId,
      name: preset.name,
      duration_minutes: preset.duration_minutes,
      passing_score: preset.passing_score,
      question_type_mix: preset.question_type_mix,
      status: "draft",
      source_preset_id: preset.id,
      created_by: userId,
    })
    .select("id")
    .single()
  if (assessmentError || !assessment) {
    throw new Error(`Failed to create assessment: ${assessmentError?.message}`)
  }

  let missingLevels: number[]
  try {
    const { error: linkError } = await supabase.from("assessment_questions").insert(
      links.map((link, index) => ({
        assessment_id: assessment.id,
        question_id: link.question_id,
        position: index,
      }))
    )
    if (linkError) throw new Error(`Failed to link questions: ${linkError.message}`)

    // Presets store questions only; the levels come from the capability ladder.
    const synced = await syncAssessmentTiers(supabase, assessment.id)
    missingLevels = synced.missingLevels
  } catch (err) {
    // Don't leave a half-built draft behind.
    const { error: cleanupError } = await supabase.from("assessments").delete().eq("id", assessment.id)
    if (cleanupError) {
      console.error(`buildAssessmentFromPreset: failed to clean up assessment ${assessment.id}:`, cleanupError)
    }
    throw err
  }

  return {
    ok: true,
    assessmentId: assessment.id,
    questionIds: links.map((link) => link.question_id),
    missingLadderLevels: missingLevels,
  }
}
