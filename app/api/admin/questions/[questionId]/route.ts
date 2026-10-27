import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { syncAssessmentTiers } from "@/lib/assessment/sync-assessment-tiers"
import { missingLevelsMessage } from "@/lib/assessment/ladder"

interface ChoiceEdit {
  id: number | string
  context: string
  isCorrect: boolean
}

interface PatchBody {
  title?: string
  description?: string
  constraints?: string | null
  sfiaLevel?: number | null
  bloomLevel?: string | null
  tags?: string[] | null
  expectedConcepts?: string[] | null
  starterCode?: string | null
  language?: string | null
  techDomain?: string | null
  sampleInput?: string | null
  sampleOutput?: string | null
  /** Updates existing choice rows by id -- never adds/removes options here. */
  choices?: ChoiceEdit[]
}

interface RouteParams {
  params: Promise<{ questionId: string }>
}

/**
 * Backs the Review page's (and later, the manual-question-creation
 * follow-on's) inline edit. Deliberately field-by-field partial update --
 * only keys present in the body get written -- so a row of edits on one
 * field doesn't clobber others.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { questionId } = await params
  const ctx = await requireCapabilityManager({ questionId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const body = (await request.json().catch(() => null)) as PatchBody | null
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  try {
    if (body.choices) {
      const correctCount = body.choices.filter((c) => c.isCorrect).length
      if (correctCount !== 1) {
        return NextResponse.json(
          { error: "Exactly one choice must be marked correct." },
          { status: 400 }
        )
      }
    }

    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title
    if (body.description !== undefined) update.description = body.description
    if (body.constraints !== undefined) update.constraints = body.constraints
    if (body.sfiaLevel !== undefined) update.sfia_level = body.sfiaLevel
    if (body.bloomLevel !== undefined) update.bloom_level = body.bloomLevel
    if (body.tags !== undefined) update.tags = body.tags
    if (body.expectedConcepts !== undefined) update.expected_concepts = body.expectedConcepts
    if (body.starterCode !== undefined) update.starter_code = body.starterCode
    if (body.language !== undefined) update.language = body.language
    if (body.techDomain !== undefined) update.tech_domain = body.techDomain
    if (body.sampleInput !== undefined) update.sample_input = body.sampleInput
    if (body.sampleOutput !== undefined) update.sample_output = body.sampleOutput

    // A yes/no question moving level needs that level on the ladder, and its assessments' tiers re-copied.
    let ladderLevelChanged = false
    if (body.sfiaLevel !== undefined) {
      const { data: current, error: currentError } = await supabase
        .from("questions")
        .select("type, capability_id, sfia_level")
        .eq("id", questionId)
        .single()
      if (currentError || !current) {
        throw new Error(`Failed to load question: ${currentError?.message ?? "not found"}`)
      }
      if (current.type === "yes_no" && body.sfiaLevel !== current.sfia_level) {
        if (body.sfiaLevel == null) {
          return NextResponse.json({ error: "A yes/no question needs an SFIA level." }, { status: 400 })
        }
        const { data: ladderRow, error: ladderError } = await supabase
          .from("capability_ladder_levels")
          .select("sfia_level")
          .eq("capability_id", current.capability_id)
          .eq("sfia_level", body.sfiaLevel)
          .maybeSingle()
        if (ladderError) throw new Error(`Failed to load the ladder: ${ladderError.message}`)
        if (!ladderRow) {
          return NextResponse.json({ error: missingLevelsMessage([body.sfiaLevel], "first") }, { status: 409 })
        }
        ladderLevelChanged = true
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from("questions").update(update).eq("id", questionId)
      if (error) throw new Error(`Failed to update question: ${error.message}`)
    }

    if (ladderLevelChanged) {
      const { data: linked, error: linkedError } = await supabase
        .from("assessment_questions")
        .select("assessment_id")
        .eq("question_id", questionId)
      if (linkedError) {
        console.error(`Failed to load assessments for question ${questionId} to re-sync tiers:`, linkedError.message)
      }
      for (const assessmentId of new Set((linked ?? []).map((l) => l.assessment_id as number))) {
        try {
          await syncAssessmentTiers(supabase, assessmentId)
        } catch (syncErr) {
          console.error(
            `Failed to re-sync assessment ${assessmentId} after moving question ${questionId}:`,
            syncErr instanceof Error ? syncErr.message : syncErr
          )
        }
      }
    }

    if (body.choices) {
      for (const choice of body.choices) {
        const { error } = await supabase
          .from("question_choices")
          .update({ context: choice.context, is_correct: choice.isCorrect })
          .eq("id", choice.id)
          .eq("question_id", questionId)
        if (error) throw new Error(`Failed to update choice: ${error.message}`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * Removes a question outright -- only ever called from the Review page on
 * freshly-generated, single-purpose rows, never on questions already used
 * elsewhere. Deletes children explicitly rather than relying on
 * ON DELETE CASCADE, since question_choices' foreign key predates this
 * migrations folder and its cascade behavior isn't confirmed in-repo.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { questionId } = await params
  const ctx = await requireCapabilityManager({ questionId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx


  try {
    const { data: linked, error: linkedError } = await supabase
      .from("assessment_questions")
      .select("assessment_id")
      .eq("question_id", questionId)
    if (linkedError) throw new Error(`Failed to load the question's assessments: ${linkedError.message}`)

    const { error: choicesError } = await supabase
      .from("question_choices")
      .delete()
      .eq("question_id", questionId)
    if (choicesError) throw new Error(`Failed to delete choices: ${choicesError.message}`)

    const { error: linkError } = await supabase
      .from("assessment_questions")
      .delete()
      .eq("question_id", questionId)
    if (linkError) throw new Error(`Failed to delete assessment link: ${linkError.message}`)

    const { error: questionError } = await supabase.from("questions").delete().eq("id", questionId)
    if (questionError) throw new Error(`Failed to delete question: ${questionError.message}`)

    // A level with no questions left drops out of each draft's snapshot.
    for (const assessmentId of new Set((linked ?? []).map((l) => l.assessment_id as number))) {
      try {
        await syncAssessmentTiers(supabase, assessmentId)
      } catch (syncErr) {
        console.error(
          `Failed to re-sync assessment ${assessmentId} after deleting question ${questionId}:`,
          syncErr instanceof Error ? syncErr.message : syncErr
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
