import { NextResponse } from "next/server"
import { classifyQuestionSkillLevel } from "@assessment-toolkit/core/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { LEVEL_COLUMNS, levelToRow, parseLadderLevelInput, rowToLevel, type LadderLevel } from "@/lib/assessment/ladder"

type ManualQuestionType = "multiple_choice" | "true_false" | "code_snippet" | "yes_no"

interface ChoiceInput {
  context: string
  isCorrect: boolean
}

interface RequestBody {
  type?: ManualQuestionType
  title?: string
  description?: string
  constraints?: string
  language?: string
  starterCode?: string
  sampleInput?: string
  sampleOutput?: string
  choices?: ChoiceInput[]
  sfiaLevel?: number
  level?: unknown
}

interface RouteParams {
  params: Promise<{ capability: string }>
}

const MANUAL_QUESTION_TYPES: ManualQuestionType[] = ["multiple_choice", "true_false", "code_snippet", "yes_no"]

/**
 * Manual counterpart to .../generate-assessment: creates ONE question
 * directly from admin-entered fields, `source = 'manual'`,
 * `status = 'pending_review'` -- lands in the same Questions tab / review
 * pipeline as AI-generated questions, no separate approval path needed.
 * yes_no questions carry an owner-chosen SFIA level and attach to the capability ladder (capability_ladder_levels); the level is created from body.level the first time it's used. They skip classification.
 *
 * SFIA level and Bloom level are never entered by the admin -- both are
 * inferred by classifyQuestionSkillLevel right after the insert, in the
 * same request. A classification failure does NOT fail question creation
 * (the question is already durable at that point); it's left with both
 * fields null and `classificationFailed: true` is returned so the admin
 * can fill them in later via the question edit page's existing PATCH
 * (app/api/admin/questions/[questionId]/route.ts already accepts both).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { capability: capabilityId } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx

  const body = (await request.json().catch(() => null)) as RequestBody | null
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }
  if (!body.type || !MANUAL_QUESTION_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${MANUAL_QUESTION_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!body.title?.trim() || (body.type !== "yes_no" && !body.description?.trim())) {
    return NextResponse.json(
      { error: body.type === "yes_no" ? "The question text is required." : "title and description are required." },
      { status: 400 }
    )
  }
  if (body.type === "multiple_choice" || body.type === "true_false") {
    const choices = body.choices ?? []
    if (choices.length < 2 || choices.some((c) => !c.context?.trim())) {
      return NextResponse.json({ error: "At least two non-empty choices are required." }, { status: 400 })
    }
    if (body.type === "true_false" && choices.length !== 2) {
      return NextResponse.json({ error: "true_false questions must have exactly two choices." }, { status: 400 })
    }
    if (choices.filter((c) => c.isCorrect).length !== 1) {
      return NextResponse.json({ error: "Exactly one choice must be marked correct." }, { status: 400 })
    }
  }

  try {
    const { data: capability, error: capabilityError } = await supabase
      .from("capabilities")
      .select("id, name, description")
      .eq("id", capabilityId)
      .single()
    if (capabilityError || !capability) {
      return NextResponse.json({ error: "Capability not found." }, { status: 404 })
    }

    if (body.type === "yes_no") {
      const sfiaLevel = body.sfiaLevel
      if (sfiaLevel == null || !Number.isInteger(sfiaLevel) || sfiaLevel < 1 || sfiaLevel > 7) {
        return NextResponse.json({ error: "Pick an SFIA level from 1 to 7." }, { status: 400 })
      }

      const { data: existing, error: existingError } = await supabase
        .from("capability_ladder_levels")
        .select(LEVEL_COLUMNS)
        .eq("capability_id", capability.id)
        .eq("sfia_level", sfiaLevel)
        .maybeSingle()
      if (existingError) throw new Error(`Failed to look up the ladder level: ${existingError.message}`)

      // The level is saved before the question: if the level can't be saved,
      // no question is created (spec: error handling).
      let level: LadderLevel
      let levelCreated = false
      if (existing) {
        level = rowToLevel(existing)
      } else {
        const parsed = parseLadderLevelInput(body.level, sfiaLevel)
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
        const { error: levelError } = await supabase
          .from("capability_ladder_levels")
          .insert(levelToRow(capability.id, parsed.level, user.id))
        if (levelError) throw new Error(`Failed to set up the level: ${levelError.message}`)
        level = parsed.level
        levelCreated = true
      }

      const { data: questionRow, error: questionError } = await supabase
        .from("questions")
        .insert({
          capability_id: capability.id,
          type: "yes_no",
          title: body.title,
          description: body.description?.trim() || body.title,
          sfia_level: sfiaLevel,
          status: "pending_review",
          source: "manual",
          created_by: user.id,
        })
        .select("id")
        .single()
      if (questionError || !questionRow) throw new Error(`Failed to create question: ${questionError?.message}`)

      return NextResponse.json({
        id: questionRow.id,
        type: "yes_no",
        title: body.title,
        sfiaLevel,
        bloomLevel: null,
        classificationFailed: false,
        level,
        levelCreated,
      })
    }

    // Fields below are deliberately nulled for non-code_snippet types
    // regardless of what the body contains -- a stray `language` on a
    // multiple_choice question can trip questions_language_check.
    const isCode = body.type === "code_snippet"

    const { data: questionRow, error: questionError } = await supabase
      .from("questions")
      .insert({
        capability_id: capability.id,
        type: body.type,
        title: body.title,
        description: body.description,
        constraints: isCode ? body.constraints?.trim() || null : null,
        language: isCode ? body.language?.trim() || null : null,
        starter_code: isCode ? body.starterCode?.trim() || null : null,
        sample_input: isCode ? body.sampleInput?.trim() || null : null,
        sample_output: isCode ? body.sampleOutput?.trim() || null : null,
        status: "pending_review",
        source: "manual",
        created_by: user.id,
      })
      .select("id")
      .single()
    if (questionError || !questionRow) {
      throw new Error(`Failed to create question: ${questionError?.message}`)
    }

    if (body.type === "multiple_choice" || body.type === "true_false") {
      const { error: choicesError } = await supabase.from("question_choices").insert(
        (body.choices ?? []).map((c) => ({
          question_id: questionRow.id,
          context: c.context,
          is_correct: c.isCorrect,
        }))
      )
      if (choicesError) {
        throw new Error(`Failed to create choices: ${choicesError.message}`)
      }
    }

    let sfiaLevel: number | null = null
    let bloomLevel: string | null = null
    let classificationFailed = false
    try {
      const classification = await classifyQuestionSkillLevel({
        title: body.title,
        description: body.description ?? "",
        type: body.type,
        constraints: isCode ? body.constraints?.trim() || undefined : undefined,
        capabilityName: capability.name,
        capabilityDescription: capability.description ?? undefined,
      })
      sfiaLevel = classification.sfiaLevel
      bloomLevel = classification.bloomLevel
      const { error: updateError } = await supabase
        .from("questions")
        .update({ sfia_level: sfiaLevel, bloom_level: bloomLevel })
        .eq("id", questionRow.id)
      if (updateError) throw new Error(`Failed to save classification: ${updateError.message}`)
    } catch (err) {
      // Non-fatal -- the question already exists (pending_review, correct
      // content). Logged so a run of failures is visible without digging
      // through client reports; admin can set both fields manually via
      // the question edit page's PATCH if this keeps happening.
      console.warn("[create-question] classification failed, leaving sfia_level/bloom_level null", {
        questionId: questionRow.id,
        error: err instanceof Error ? err.message : err,
      })
      sfiaLevel = null
      bloomLevel = null
      classificationFailed = true
    }

    return NextResponse.json({
      id: questionRow.id,
      type: body.type,
      title: body.title,
      sfiaLevel,
      bloomLevel,
      classificationFailed,
      level: null,
      levelCreated: false,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
