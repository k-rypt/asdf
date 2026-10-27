import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AssessmentReviewClient, type ReviewQuestion, type ReviewTier } from "./assessment-review-client"
import { LEVEL_COLUMNS, rowToLevel } from "@/lib/assessment/ladder"

/** questions row with its question_choices, as selected below. */
interface QuestionRow {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  sfia_level: number | null
  question_choices: { id: number | string; context: string; is_correct: boolean }[] | null
}

function toReviewQuestion(q: QuestionRow): ReviewQuestion {
  return {
    id: q.id,
    type: q.type,
    title: q.title,
    description: q.description,
    status: q.status,
    sfiaLevel: q.sfia_level,
    choices: (q.question_choices ?? []).map((c) => ({ id: c.id, context: c.context, isCorrect: c.is_correct })),
  }
}

/**
 * Shared review-page view, mounted under both
 * app/protected/capability/[capability]/assessments/[assessmentId]/review
 * and the matching app/protected/admin/... tree -- same dual-mount pattern
 * as CapabilityDetailView/QuestionDetailView.
 */
export async function AssessmentReviewView({
  assessmentId,
  capabilityId,
  backHref,
  questionIds,
  canPublish = false,
}: {
  assessmentId: string
  capabilityId: string
  backHref: string
  /**
   * Question ids straight from generate-assessment's response, in
   * generated order. When present (the redirect immediately after
   * generation), these are used directly instead of re-querying
   * assessment_questions, so the just-created rows don't have to be
   * visible in that join yet. Independent visits to this route (e.g. a
   * "Review Draft" link from the capability page) omit this and fall
   * back to the join below.
   */
  questionIds?: string[]
  /**
   * Admin-only (same convention as CapabilityDetailView's `canManage`):
   * a static per-mount boolean, not a runtime role query. Publishing is
   * gated server-side too (the publish route checks roleNames itself),
   * so this is UI convenience, not the actual boundary.
   */
  canPublish?: boolean
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, name, duration_minutes, passing_score, status, capability_id")
    .eq("id", assessmentId)
    .single()
  if (assessmentError || !assessment) return notFound()

  const { data: tierRows, error: tiersError } = await supabase
    .from("assessment_tiers")
    .select("id, sfia_level, label, applies_to, pass_threshold, advance_message, stay_message")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true })
  if (tiersError) return notFound()

  const tiers: ReviewTier[] = (tierRows ?? []).map((t) => ({
    id: t.id,
    sfiaLevel: t.sfia_level,
    label: t.label,
    appliesTo: t.applies_to,
    passThreshold: t.pass_threshold,
    advanceMessage: t.advance_message,
    stayMessage: t.stay_message,
  }))

  // The capability ladder decides whether "Add tier question" creates a level or reuses one.
  const { data: ladderRows, error: ladderError } =
    assessment.capability_id == null
      ? { data: [], error: null }
      : await supabase
          .from("capability_ladder_levels")
          .select(LEVEL_COLUMNS)
          .eq("capability_id", assessment.capability_id)
          .order("sfia_level", { ascending: true })
  if (ladderError) return notFound()
  const ladder = (ladderRows ?? []).map(rowToLevel)

  let questions: ReviewQuestion[]

  if (questionIds?.length) {
    const { data: rows, error: questionsError } = await supabase
      .from("questions")
      .select("*, question_choices(*)")
      .in("id", questionIds)
    if (questionsError) return notFound()

    const byId = new Map(((rows ?? []) as QuestionRow[]).map((q) => [q.id, q]))
    questions = questionIds
      .map((id) => byId.get(id))
      .filter((q): q is QuestionRow => q != null)
      .map(toReviewQuestion)
  } else {
    const { data: links, error: linksError } = await supabase
      .from("assessment_questions")
      .select("position, questions(*, question_choices(*))")
      .eq("assessment_id", assessmentId)
      .order("position", { ascending: true })
    if (linksError) return notFound()

    // The nested question_choices select above returns choices grouped
    // under each question row; flatten into the shape the client expects.
    questions = ((links ?? []) as unknown as { questions: QuestionRow }[]).map((link) =>
      toReviewQuestion(link.questions)
    )
  }

  return (
    <AssessmentReviewClient
      backHref={backHref}
      capabilityId={capabilityId}
      assessmentId={assessment.id}
      assessmentName={assessment.name}
      durationMinutes={assessment.duration_minutes}
      passingScore={assessment.passing_score}
      initialQuestions={questions}
      tiers={tiers}
      ladder={ladder}
      canPublish={canPublish}
    />
  )
}
