import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { LEVEL_COLUMNS, canSyncTiers, levelToRow, parseLadderLevelInput } from "@/lib/assessment/ladder"
import { syncAssessmentTiers } from "@/lib/assessment/sync-assessment-tiers"

interface RequestBody {
  title?: string
  description?: string
  sfiaLevel?: number
  label?: string
  appliesTo?: string
  passThreshold?: number
  advanceMessage?: string
  stayMessage?: string
}

interface RouteParams {
  params: Promise<{ assessmentId: string }>
}

/**
 * Manual tier-question creation for the yes_no self-assessment ladder --
 * the counterpart to .../capabilities/[capability]/questions/route.ts,
 * which explicitly excludes yes_no because it has no tier to attach to.
 *
 * The level itself now lives on the capability ladder
 * (capability_ladder_levels). If the ladder has no level at this sfiaLevel,
 * one is created from the request body's fields (label, appliesTo,
 * passThreshold, advanceMessage, stayMessage); an existing level is used
 * as-is and those fields are ignored -- editing a level is PATCH
 * .../tiers/[tierId] or the ladder editor. After the question is linked,
 * the assessment's assessment_tiers snapshot is re-copied from the ladder
 * and the snapshot tier is returned.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { assessmentId } = await params
  const ctx = await requireCapabilityManager({ assessmentId })
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }
  if (!body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json({ error: "title and description are required." }, { status: 400 })
  }
  if (body.sfiaLevel == null || !Number.isInteger(body.sfiaLevel) || body.sfiaLevel < 1 || body.sfiaLevel > 7) {
    return NextResponse.json({ error: "sfiaLevel must be an integer from 1 to 7." }, { status: 400 })
  }

  try {
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("id, capability_id, status")
      .eq("id", assessmentId)
      .single()
    if (assessmentError || !assessment) {
      return NextResponse.json({ error: "Assessment not found." }, { status: 404 })
    }

    if (assessment.capability_id == null) {
      return NextResponse.json(
        { error: "This assessment isn't linked to a capability, so it has no ladder." },
        { status: 400 }
      )
    }

    if (!canSyncTiers(assessment.status)) {
      return NextResponse.json(
        { error: "This assessment is published, so its questions and levels are frozen." },
        { status: 409 }
      )
    }

    const { data: existingLevel, error: existingLevelError } = await supabase
      .from("capability_ladder_levels")
      .select(LEVEL_COLUMNS)
      .eq("capability_id", assessment.capability_id)
      .eq("sfia_level", body.sfiaLevel)
      .maybeSingle()
    if (existingLevelError) {
      throw new Error(`Failed to look up the ladder level: ${existingLevelError.message}`)
    }

    if (!existingLevel) {
      const parsed = parseLadderLevelInput(body, body.sfiaLevel)
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      const { error: levelError } = await supabase
        .from("capability_ladder_levels")
        .insert(levelToRow(assessment.capability_id, parsed.level, user.id))
      if (levelError) throw new Error(`Failed to create the ladder level: ${levelError.message}`)
    }

    const { data: questionRow, error: questionError } = await supabase
      .from("questions")
      .insert({
        capability_id: assessment.capability_id,
        type: "yes_no",
        title: body.title,
        description: body.description,
        sfia_level: body.sfiaLevel,
        status: "pending_review",
        source: "manual",
        created_by: user.id,
      })
      .select("id")
      .single()
    if (questionError || !questionRow) {
      throw new Error(`Failed to create question: ${questionError?.message}`)
    }

    const { count: linkCount } = await supabase
      .from("assessment_questions")
      .select("question_id", { count: "exact", head: true })
      .eq("assessment_id", assessment.id)
    const { error: linkError } = await supabase.from("assessment_questions").insert({
      assessment_id: assessment.id,
      question_id: questionRow.id,
      position: linkCount ?? 0,
    })
    if (linkError) {
      throw new Error(`Failed to link question to assessment: ${linkError.message}`)
    }

    await syncAssessmentTiers(supabase, assessment.id)

    const { data: tier, error: tierError } = await supabase
      .from("assessment_tiers")
      .select("id, sfia_level, label, applies_to, pass_threshold, advance_message, stay_message")
      .eq("assessment_id", assessment.id)
      .eq("sfia_level", body.sfiaLevel)
      .maybeSingle()
    if (tierError) throw new Error(`Failed to read the level back: ${tierError.message}`)
    if (!tier) throw new Error("The level couldn't be copied into this assessment.")

    return NextResponse.json({
      id: questionRow.id,
      type: "yes_no",
      title: body.title,
      sfiaLevel: tier.sfia_level,
      tierLabel: tier.label,
      tierId: tier.id,
      appliesTo: tier.applies_to,
      passThreshold: tier.pass_threshold,
      advanceMessage: tier.advance_message,
      stayMessage: tier.stay_message,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
