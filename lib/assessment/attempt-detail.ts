import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SubmissionResult, TierResult } from "@assessment-toolkit/core"
import { mapAttemptAnswerRowToSubmissionResult, type AttemptAnswerRecord } from "./supabase-assessment-api-client"

/**
 * What the employee actually submitted, formatted per question type --
 * `mapAttemptAnswerRowToSubmissionResult`'s SubmissionResult carries the
 * *graded outcome* (score/feedback/displayLevel) but deliberately drops
 * `raw_answer` for every type except yes_no (the live take-flow UI never
 * needs it back -- the question is still on screen when it's submitted).
 * The review/detail view has no such context, so it needs the raw answer
 * reconstructed separately -- see spec Section 4's "employee's answer
 * (`raw_answer`, formatted per question type)" requirement.
 */
export type RawAnswerDisplay =
  | { kind: "choice"; text: string | null }
  | { kind: "code"; code: string; compilationOutput?: string }
  | { kind: "yes_no" }

export interface AttemptAnswerDetail extends SubmissionResult {
  questionType: "multiple_choice" | "true_false" | "yes_no" | "code_snippet"
  rawAnswerDisplay: RawAnswerDisplay | null
}

export interface AttemptDetail {
  attemptId: number
  profileId: string
  profileName: string
  profileEmail: string
  capabilityId: number
  capabilityName: string
  status: string
  startedAt: string
  completedAt: string | null
  passed: boolean | null
  tierResult: TierResult | null
  answers: AttemptAnswerDetail[]
}

/** attempt_answers row with the joined question, as selected in loadAttemptDetail. */
type AnswerRow = AttemptAnswerRecord & {
  question_id: string
  raw_answer: unknown
  questions: { title: string; type: string } | { title: string; type: string }[] | null
}

/**
 * One query path, two callers (Manager and Capability-Owner "View
 * details" pages) -- both need the exact same per-question breakdown an
 * employee saw at submission time, reconstructed from attempt_answers via
 * the same mapper startSession's resume branch uses
 * (supabase-assessment-api-client.ts). RLS already scopes *who* can read
 * these rows (owner, admin/capability-owner role, or -- as of the
 * 2026-10-02 migration -- a manager of the attempt's owner); `capabilityId`
 * here is an additional *application*-level narrowing for the
 * capability-owner route specifically, since the existing "admin or
 * capability owner" RLS policy is role-based, not scoped to one
 * capability -- without this check, a capability owner could view any
 * other capability's attempt by guessing its id in the URL.
 *
 * Returns "not_found" for both "the attempt doesn't exist" and "RLS/the
 * capabilityId check filtered it out" -- deliberately the same shape,
 * matching this app's existing "don't reveal what exists" posture
 * (see require-employee-assessment-client.ts). Returns "error" only for
 * an actual query failure, which the caller must render honestly rather
 * than treating as not-found -- see the 2026-10-02 spec's error-handling
 * section.
 */
export async function loadAttemptDetail(
  supabase: SupabaseClient,
  attemptId: number,
  options?: { capabilityId?: number }
): Promise<AttemptDetail | "not_found" | "error"> {
  const { data: attempt, error: attemptError } = await supabase
    .from("attempts")
    .select(
      "id, assessment_id, profile_id, status, started_at, completed_at, passed, tier_result, assessments(capability_id, capabilities(name)), profiles(given_name, last_name, email)"
    )
    .eq("id", attemptId)
    .maybeSingle()

  if (attemptError) return "error"
  if (!attempt) return "not_found"

  const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments
  const profile = Array.isArray(attempt.profiles) ? attempt.profiles[0] : attempt.profiles
  const capability = assessment
    ? Array.isArray(assessment.capabilities)
      ? assessment.capabilities[0]
      : assessment.capabilities
    : null

  if (!assessment || (options?.capabilityId != null && assessment.capability_id !== options.capabilityId)) {
    return "not_found"
  }

  const { data: positionRows, error: positionError } = await supabase
    .from("assessment_questions")
    .select("question_id, position")
    .eq("assessment_id", attempt.assessment_id)
  if (positionError) return "error"
  const positionByQuestionId = new Map((positionRows ?? []).map((r) => [r.question_id as string, r.position as number]))

  const { data: answerRows, error: answersError } = await supabase
    .from("attempt_answers")
    .select(
      "question_id, raw_answer, time_spent, total_score, score_correctness, score_quality, score_edge_case, score_best_practice, display_level, display_level_description, feedback, chain_of_thought, annotated_code, guides, sfia_level_assigned, knowledge_gaps, questions(title, type)"
    )
    .eq("attempt_id", attemptId)
  if (answersError) return "error"

  // multiple_choice/true_false's raw_answer only stores the chosen
  // question_choices.id -- resolve those ids to their display text in one
  // batch query rather than one per answer.
  const answerRecords = (answerRows ?? []) as unknown as AnswerRow[]
  const selectedChoiceIds = answerRecords
    .map((row) => (row.raw_answer as { selectedChoiceId?: string | number } | null)?.selectedChoiceId)
    .filter((id): id is string | number => id != null)
  const { data: choiceRows, error: choicesError } =
    selectedChoiceIds.length > 0
      ? await supabase.from("question_choices").select("id, context").in("id", selectedChoiceIds)
      : { data: [] as { id: string | number; context: string }[], error: null }
  if (choicesError) return "error"
  const choiceTextById = new Map((choiceRows ?? []).map((c) => [String(c.id), c.context as string]))

  const answers: AttemptAnswerDetail[] = answerRecords
    .map((row) => {
      const question = Array.isArray(row.questions) ? row.questions[0] : row.questions
      const questionType = (question?.type ?? "multiple_choice") as AttemptAnswerDetail["questionType"]
      const base = mapAttemptAnswerRowToSubmissionResult(row as AttemptAnswerRecord, {
        title: question?.title ?? "Untitled question",
        type: questionType,
      })
      const rawAnswer = row.raw_answer as
        | { selectedChoiceId?: string | number; code?: string; compilationOutput?: string }
        | null

      let rawAnswerDisplay: RawAnswerDisplay | null
      if (questionType === "yes_no") {
        rawAnswerDisplay = { kind: "yes_no" }
      } else if (questionType === "code_snippet") {
        rawAnswerDisplay = rawAnswer?.code != null
          ? { kind: "code", code: rawAnswer.code, compilationOutput: rawAnswer.compilationOutput }
          : null
      } else {
        const choiceId = rawAnswer?.selectedChoiceId
        rawAnswerDisplay = { kind: "choice", text: choiceId != null ? choiceTextById.get(String(choiceId)) ?? null : null }
      }

      return { ...base, questionType, rawAnswerDisplay }
    })
    .sort((a, b) => (positionByQuestionId.get(a.questionId) ?? Infinity) - (positionByQuestionId.get(b.questionId) ?? Infinity))

  return {
    attemptId: attempt.id as number,
    profileId: attempt.profile_id as string,
    profileName: profile ? `${profile.given_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Unknown",
    profileEmail: profile?.email ?? "",
    capabilityId: assessment.capability_id as number,
    capabilityName: capability?.name ?? "Unknown",
    status: attempt.status as string,
    startedAt: attempt.started_at as string,
    completedAt: attempt.completed_at as string | null,
    passed: attempt.passed as boolean | null,
    tierResult: (attempt.tier_result ?? null) as TierResult | null,
    answers,
  }
}
