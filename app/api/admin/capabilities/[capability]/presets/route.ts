import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { mixesLadderAndGraded } from "@/lib/assessment/ladder"

interface RequestBody {
  name?: string
  description?: string
  passingScore?: number
  questionTypeMix?: Record<string, number>
  questionIds?: string[]
}

interface RouteParams {
  params: Promise<{ capability: string }>
}

/**
 * "Save Preset" from the Customize Preset step -- writes question_presets
 * + question_preset_questions only. No companion assessment, nothing
 * submitted for approval -- that's a separate action (Part 2's
 * /api/admin/presets/:presetId/submit).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { capability: capabilityId } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "A preset name is required." }, { status: 400 })
  }
  if (!body.questionIds?.length) {
    return NextResponse.json({ error: "At least one question is required." }, { status: 400 })
  }

  try {
    // Same rule as the Add questions pop-up: a preset is either a yes/no ladder or graded questions, never both.
    const { data: selectedQuestions, error: typesError } = await supabase
      .from("questions")
      .select("type")
      .eq("capability_id", capabilityId)
      .in("id", body.questionIds)
    if (typesError) throw new Error(`Failed to load the selected questions: ${typesError.message}`)
    if (mixesLadderAndGraded((selectedQuestions ?? []).map((q) => q.type as string))) {
      return NextResponse.json(
        { error: "A preset can't mix Yes/No ladder questions with other question types." },
        { status: 400 }
      )
    }

    const { data: preset, error: presetError } = await supabase
      .from("question_presets")
      .insert({
        capability_id: capabilityId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        duration_minutes: null, // Admins set duration on the assessment (spec section 5).
        passing_score: body.passingScore ?? null,
        question_type_mix: body.questionTypeMix ?? null,
        created_by: user.id,
      })
      .select("id")
      .single()
    if (presetError || !preset) {
      throw new Error(`Failed to create preset: ${presetError?.message}`)
    }

    const { error: linksError } = await supabase.from("question_preset_questions").insert(
      body.questionIds.map((questionId, index) => ({
        preset_id: preset.id,
        question_id: questionId,
        position: index,
      }))
    )
    if (linksError) {
      throw new Error(`Failed to link questions to preset: ${linksError.message}`)
    }

    return NextResponse.json({ presetId: preset.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
