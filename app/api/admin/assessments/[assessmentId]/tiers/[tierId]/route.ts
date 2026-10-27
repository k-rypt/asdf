import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { canSyncTiers } from "@/lib/assessment/ladder"
import { syncCapabilityDrafts } from "@/lib/assessment/sync-assessment-tiers"

interface RequestBody {
  label?: string
  appliesTo?: string
  passThreshold?: number
  advanceMessage?: string
  stayMessage?: string
}

interface RouteParams {
  params: Promise<{ assessmentId: string; tierId: string }>
}

/**
 * Edits a level's authored metadata. The level lives on the capability
 * ladder (capability_ladder_levels), so this writes the ladder and then
 * re-copies every editable draft of the capability (the tier id normally
 * stays the same, but callers should take the id in the response).
 * Published assessments are frozen (409).
 *
 * sfiaLevel is deliberately not accepted here -- it's the join key every
 * yes_no question's sfia_level is matched against (see
 * shouldHaltAfterAnswer/evaluateYesNoLadder in gradeYesNoSubmission.ts),
 * and changing it would silently orphan every question already written
 * against the old level.
 *
 * Only the fields present in the body are updated -- an admin editing
 * just the advance message should not wipe out label/appliesTo/etc by
 * omission.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { assessmentId, tierId } = await params
  const ctx = await requireCapabilityManager({ assessmentId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx
  const userId = ctx.user.id

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.label !== undefined) {
    if (!body.label.trim()) {
      return NextResponse.json({ error: "label can't be empty." }, { status: 400 })
    }
    update.label = body.label
  }
  if (body.appliesTo !== undefined) update.applies_to = body.appliesTo.trim() || null
  if (body.passThreshold !== undefined) {
    if (body.passThreshold < 0 || body.passThreshold > 1) {
      return NextResponse.json({ error: "passThreshold must be between 0 and 1." }, { status: 400 })
    }
    update.pass_threshold = body.passThreshold
  }
  if (body.advanceMessage !== undefined) update.advance_message = body.advanceMessage.trim() || null
  if (body.stayMessage !== undefined) update.stay_message = body.stayMessage.trim() || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No recognized fields to update." }, { status: 400 })
  }

  try {
    const { data: current, error: currentError } = await supabase
      .from("assessment_tiers")
      .select("sfia_level, assessments!inner(capability_id, status)")
      .eq("id", tierId)
      .eq("assessment_id", assessmentId)
      .maybeSingle()
    if (currentError) throw new Error(`Failed to load the tier: ${currentError.message}`)
    if (!current) return NextResponse.json({ error: "Tier not found on this assessment." }, { status: 404 })
    const owner = (Array.isArray(current.assessments) ? current.assessments[0] : current.assessments) as {
      capability_id: number | null
      status: string | null
    }
    if (owner.capability_id == null) {
      return NextResponse.json({ error: "This assessment isn't linked to a capability, so it has no ladder." }, { status: 400 })
    }
    if (!canSyncTiers(owner.status)) {
      return NextResponse.json(
        { error: "This assessment is published, so its levels are frozen. Edit the capability's ladder instead." },
        { status: 409 }
      )
    }

    const { data: ladderRows, error: ladderError } = await supabase
      .from("capability_ladder_levels")
      .update({ ...update, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("capability_id", owner.capability_id)
      .eq("sfia_level", current.sfia_level)
      .select("sfia_level")
    if (ladderError) throw new Error(`Failed to update the ladder level: ${ladderError.message}`)
    if (!ladderRows || ladderRows.length === 0) {
      return NextResponse.json(
        { error: "This level isn't on the capability's ladder. Add it in the Self-assessment ladder card first." },
        { status: 409 }
      )
    }
    const { failedAssessmentIds } = await syncCapabilityDrafts(supabase, owner.capability_id)
    if (failedAssessmentIds.length > 0) {
      console.error("Failed to re-sync draft assessments after a ladder edit:", failedAssessmentIds)
    }

    const { data: tier, error } = await supabase
      .from("assessment_tiers")
      .select("id, sfia_level, label, applies_to, pass_threshold, advance_message, stay_message")
      .eq("assessment_id", assessmentId)
      .eq("sfia_level", current.sfia_level)
      .single()
    if (error || !tier) throw new Error(`Failed to read the tier back: ${error?.message}`)

    return NextResponse.json({
      id: tier.id,
      sfiaLevel: tier.sfia_level,
      label: tier.label,
      appliesTo: tier.applies_to,
      passThreshold: tier.pass_threshold,
      advanceMessage: tier.advance_message,
      stayMessage: tier.stay_message,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
