import { NextResponse } from "next/server"
import type { QuestionType } from "@assessment-toolkit/core"
import { generateAssessmentFromJobDescription } from "@assessment-toolkit/core/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { LEVEL_COLUMNS, levelToRow, mergeLadderLevels, rowToLevel } from "@/lib/assessment/ladder"
import { syncAssessmentTiers } from "@/lib/assessment/sync-assessment-tiers"

interface RequestBody {
  jobDescription?: string
  questionCount?: number
  /**
   * Which question types this draft may include. Omitted = all four types
   * allowed, model's judgment on whether to include a yes_no ladder (same
   * as today's behavior). See generateAssessmentFromJobDescription's
   * allowedTypes doc comment for the full semantics.
   */
  allowedTypes?: QuestionType[]
  sfiaLevelMin?: number
  sfiaLevelMax?: number
  /** Freeform guidance layered on top of the standard generation rules, e.g. "match the structure of this example ladder". */
  additionalInstructions?: string
  /** Overrides the AI-drafted value when persisting, if provided. */
  passingScoreOverride?: number
}

interface RouteParams {
  params: Promise<{ capability: string }>
}

/**
 * Drafts a full assessment (metadata + questions, optionally a yes_no
 * tier ladder) from a job description via generateAssessmentFromJobDescription,
 * then persists it:
 *   - `assessments` row with status = 'draft' (never 'published' -- a
 *     capability lead has to promote it explicitly, same as questions below).
 *   - one `questions` row per drafted question, status = 'pending_review',
 *     source = 'ai_generated' -- never reaches an employee until reviewed
 *     and promoted to 'active' (see questions_code_language.sql / the
 *     question authoring lifecycle note in the schema migration).
 *   - `question_choices` rows for multiple_choice/true_false questions.
 *   - `assessment_questions` linking rows, in generated order.
 *   - capability_ladder_levels rows for levels the capability doesn't have yet, then this assessment's assessment_tiers copy (syncAssessmentTiers).
 *
 * Inserts happen sequentially, not in a single transaction (Supabase's
 * client SDK has no cross-table transaction primitive without a database
 * function, and there's no service-role client available server-side in
 * this app yet -- see app/api/admin/invitations/route.ts for the same
 * constraint). A failure partway through leaves earlier rows in place as
 * drafts/pending_review, which is inert rather than harmful -- nothing
 * with status = 'draft'/'pending_review' is visible to an employee -- but
 * it does mean a failed generation can leave orphaned rows behind for an
 * admin to clean up. Flagged here rather than silently accepted.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { capability: capabilityId } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body?.jobDescription?.trim()) {
    return NextResponse.json({ error: "jobDescription is required." }, { status: 400 })
  }
  if (body.sfiaLevelMin != null && body.sfiaLevelMax != null && body.sfiaLevelMin > body.sfiaLevelMax) {
    return NextResponse.json({ error: "sfiaLevelMin can't be greater than sfiaLevelMax." }, { status: 400 })
  }

  const { supabase, user } = ctx

  try {
    const { data: capability, error: capabilityError } = await supabase
      .from("capabilities")
      .select("id, name, description")
      .eq("id", capabilityId)
      .single()
    if (capabilityError || !capability) {
      return NextResponse.json({ error: "Capability not found." }, { status: 404 })
    }

    const draft = await generateAssessmentFromJobDescription({
      jobDescription: body.jobDescription,
      capabilityName: capability.name,
      capabilityDescription: capability.description ?? undefined,
      questionCount: body.questionCount,
      allowedTypes: body.allowedTypes,
      sfiaLevelMin: body.sfiaLevelMin,
      sfiaLevelMax: body.sfiaLevelMax,
      additionalInstructions: body.additionalInstructions,
    })

    if (draft.questions.length === 0) {
      console.error("[generate-assessment] draft had zero questions after generation/sanitization", {
        capabilityId,
        jobDescriptionLength: body.jobDescription.length,
        options: {
          questionCount: body.questionCount,
          allowedTypes: body.allowedTypes,
          sfiaLevelMin: body.sfiaLevelMin,
          sfiaLevelMax: body.sfiaLevelMax,
        },
        draftAssessmentTitle: draft.assessmentTitle,
        draftTiers: draft.tiers,
        droppedQuestions: draft.droppedQuestions,
      })
      return NextResponse.json(
        { error: "The model didn't return any usable questions for this job description -- try again or add more detail." },
        { status: 422 }
      )
    }

    if (draft.droppedQuestions.length > 0) {
      // Non-fatal -- some usable questions came back, just fewer than
      // requested/drafted. Logged so a short batch is explainable without
      // digging through the model's raw output; also returned below so the
      // admin UI can tell the owner why instead of just showing a smaller count.
      console.warn("[generate-assessment] sanitizeDraft dropped some questions", {
        capabilityId,
        keptCount: draft.questions.length,
        droppedCount: draft.droppedQuestions.length,
        droppedQuestions: draft.droppedQuestions,
      })
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert({
        capability_id: capability.id,
        name: draft.assessmentTitle,
        duration_minutes: null, // Admins set duration on the campaign page (spec section 5).
        passing_score: body.passingScoreOverride ?? draft.passingScore,
        question_type_mix: draft.questionTypeMix,
        status: "draft",
        created_by: user.id,
      })
      .select("id")
      .single()
    if (assessmentError || !assessment) {
      throw new Error(`Failed to create assessment: ${assessmentError?.message}`)
    }

    const createdQuestions: { id: string; type: string; title: string; sfiaLevel: number | null }[] = []

    for (const [index, q] of draft.questions.entries()) {
      const { data: questionRow, error: questionError } = await supabase
        .from("questions")
        .insert({
          capability_id: capability.id,
          type: q.type,
          title: q.title,
          description: q.description,
          constraints: q.constraints ?? null,
          sfia_level: q.sfiaLevel,
          bloom_level: q.bloomLevel ?? null,
          tags: q.tags ?? null,
          expected_concepts: q.expectedConcepts ?? null,
          starter_code: q.starterCode ?? null,
          language: q.language ?? null,
          tech_domain: q.techDomain ?? null,
          sample_input: q.sampleInput ?? null,
          sample_output: q.sampleOutput ?? null,
          status: "pending_review",
          source: "ai_generated",
          created_by: user.id,
        })
        .select("id")
        .single()
      if (questionError || !questionRow) {
        throw new Error(`Failed to create question "${q.title}": ${questionError?.message}`)
      }

      if ((q.type === "multiple_choice" || q.type === "true_false") && q.options?.length) {
        const { error: choicesError } = await supabase.from("question_choices").insert(
          q.options.map((o) => ({
            question_id: questionRow.id,
            context: o.text,
            is_correct: o.isCorrect,
          }))
        )
        if (choicesError) {
          throw new Error(`Failed to create choices for question "${q.title}": ${choicesError.message}`)
        }
      }

      const { error: linkError } = await supabase.from("assessment_questions").insert({
        assessment_id: assessment.id,
        question_id: questionRow.id,
        position: index,
      })
      if (linkError) {
        throw new Error(`Failed to link question "${q.title}" to the assessment: ${linkError.message}`)
      }

      createdQuestions.push({ id: questionRow.id, type: q.type, title: q.title, sfiaLevel: q.sfiaLevel })
    }

    // AI-drafted levels only fill gaps in the capability ladder -- an owner's
    // existing level is kept as is. The assessment then gets its own copy.
    let keptLadderLevels: number[] = []
    if (draft.tiers?.length) {
      const { data: existingRows, error: existingError } = await supabase
        .from("capability_ladder_levels")
        .select(LEVEL_COLUMNS)
        .eq("capability_id", capability.id)
      if (existingError) throw new Error(`Failed to load the ladder: ${existingError.message}`)
      const { add, kept } = mergeLadderLevels(
        (existingRows ?? []).map(rowToLevel),
        draft.tiers.map((t) => ({
          sfiaLevel: t.sfiaLevel,
          label: t.label,
          appliesTo: t.appliesTo ?? null,
          passThreshold: t.passThreshold,
          advanceMessage: t.advanceMessage ?? null,
          stayMessage: t.stayMessage ?? null,
        }))
      )
      if (add.length > 0) {
        const { error: addError } = await supabase
          .from("capability_ladder_levels")
          .insert(add.map((l) => levelToRow(capability.id, l, user.id)))
        if (addError) throw new Error(`Failed to add ladder levels: ${addError.message}`)
      }
      keptLadderLevels = kept
    }
    const { missingLevels: missingLadderLevels } = await syncAssessmentTiers(supabase, assessment.id)

    return NextResponse.json({
      assessmentId: assessment.id,
      assessmentTitle: draft.assessmentTitle,
      assessmentDescription: draft.assessmentDescription,
      status: "draft",
      questions: createdQuestions,
      droppedQuestions: draft.droppedQuestions,
      keptLadderLevels,
      missingLadderLevels,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
