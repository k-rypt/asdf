import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { publishConflictFailure } from "./publish-conflict"
import { missingLevelsMessage, missingTierLevels } from "./ladder"

export interface PublishSuccess {
  ok: true
  availableFrom: string
  availableUntil: string | null
}

export interface PublishFailure {
  ok: false
  status: number
  error: string
}

const ALLOWED_DURATIONS = new Set<number | null>([7, 14, 30, null])

/**
 * Extracted from app/api/admin/assessments/[assessmentId]/publish/route.ts
 * so the approve route (presets/[presetId]/approve/route.ts) can call it
 * directly instead of issuing an internal HTTP request. Behavior-
 * preserving extraction -- no logic changes, including the body
 * validation, which moved in from the route's pre-try-block checks.
 */
export async function publishAssessment(
  supabase: SupabaseClient,
  assessmentId: string,
  body: { availableFrom: string; durationDays: number | null }
): Promise<PublishSuccess | PublishFailure> {
  if (!ALLOWED_DURATIONS.has(body.durationDays)) {
    return { ok: false, status: 400, error: "durationDays must be 7, 14, 30, or null." }
  }
  const availableFromDate = body.availableFrom ? new Date(body.availableFrom) : null
  if (!availableFromDate || Number.isNaN(availableFromDate.getTime())) {
    return { ok: false, status: 400, error: "availableFrom must be a valid date." }
  }

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, capability_id, source_preset_id")
    .eq("id", assessmentId)
    .single()
  if (assessmentError || !assessment) {
    throw new Error(assessmentError?.message ?? "Assessment not found.")
  }

  const { data: links, error: linksError } = await supabase
    .from("assessment_questions")
    .select("questions(status, type, sfia_level)")
    .eq("assessment_id", assessmentId)
  if (linksError) throw new Error(`Failed to load linked questions: ${linksError.message}`)

  if ((links ?? []).length === 0) {
    return { ok: false, status: 400, error: "An assessment needs at least one question before publishing." }
  }
  const linkedQuestions = (
    (links ?? []) as unknown as {
      questions: { status: string; type: string | null; sfia_level: number | null } | null
    }[]
  ).map((link) => link.questions)
  const hasPendingReview = linkedQuestions.some((q) => q?.status === "pending_review")
  if (hasPendingReview) {
    return { ok: false, status: 400, error: "Every question must be active before publishing." }
  }

  // The attempt engine silently ignores yes/no answers at a level with no tier, so never publish one.
  const ladderQuestionLevels = linkedQuestions
    .filter((q) => q?.type === "yes_no" && q.sfia_level != null)
    .map((q) => q!.sfia_level as number)
  if (ladderQuestionLevels.length > 0) {
    const { data: tiers, error: tiersError } = await supabase
      .from("assessment_tiers")
      .select("sfia_level")
      .eq("assessment_id", assessmentId)
    if (tiersError) throw new Error(`Failed to load assessment tiers: ${tiersError.message}`)
    const missing = missingTierLevels(
      ladderQuestionLevels,
      (tiers ?? []).map((t) => t.sfia_level as number)
    )
    if (missing.length > 0) {
      return { ok: false, status: 409, error: missingLevelsMessage(missing, "before publishing") }
    }
  }

  const { error: archiveError } = await supabase
    .from("assessments")
    .update({ status: "archived" })
    .eq("capability_id", assessment.capability_id)
    .eq("status", "published")
  if (archiveError) throw new Error(`Failed to archive previous assessment: ${archiveError.message}`)

  const availableUntil =
    body.durationDays == null
      ? null
      : new Date(availableFromDate.getTime() + body.durationDays * 24 * 60 * 60 * 1000).toISOString()

  const { error: publishError } = await supabase
    .from("assessments")
    .update({
      status: "published",
      available_from: availableFromDate.toISOString(),
      available_until: availableUntil,
    })
    .eq("id", assessmentId)
  if (publishError) {
    const conflict = publishConflictFailure(publishError)
    if (conflict) return conflict
    throw new Error(`Failed to publish assessment: ${publishError.message}`)
  }

  if (assessment.source_preset_id) {
    const { error: presetError } = await supabase
      .from("capabilities")
      .update({ current_preset: assessment.source_preset_id })
      .eq("id", assessment.capability_id)
    if (presetError) throw new Error(`Failed to set active preset: ${presetError.message}`)
  }

  return { ok: true, availableFrom: availableFromDate.toISOString(), availableUntil }
}
