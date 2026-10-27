import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  AnnotatedCodeEntry,
  AssessmentApiClient,
  AssessmentStatus,
  AssessmentTier,
  CodeLanguage,
  HeartbeatResult,
  Question,
  StartSessionResult,
  StudyGuide,
  SubmissionResult,
  TierResult,
} from "@assessment-toolkit/core"
import {
  buildTierResult,
  gradeCodeSubmission,
  gradeMultipleChoiceSubmission,
  shouldHaltAfterAnswer,
} from "@assessment-toolkit/core/server"
import { calibrateQuestion, computeAttemptTheta } from "./calibrate-question"
import { shouldComputeTheta } from "./should-compute-theta"
import { heartbeatOutcome } from "./heartbeat-outcome"
import { loadAttemptGate } from "./attempt-gate"

/** startSession refuses a second attempt; the start route maps this to a 409. */
export class AttemptAlreadyFinishedError extends Error {
  constructor() {
    super("You have already taken this assessment.")
    this.name = "AttemptAlreadyFinishedError"
  }
}
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

/**
 * Repository-layer implementation of assessment-toolkit's AssessmentApiClient,
 * backed by the real rsact_assessment schema (assessments, attempts,
 * attempt_answers, assessment_questions, assessment_tiers, questions,
 * question_choices).
 *
 * SERVER-ONLY -- construct this only with a server-side Supabase client (see
 * `@/supabase/server`), and only call it from trusted server code (Route
 * Handlers / Server Actions), never pass it directly as the `api` prop to
 * assessment-ui's client-side <AssessmentContainer>. `getQuestion` and
 * `getNextQuestion` deliberately never select `question_choices.is_correct`,
 * and `submitAnswer` fetches that column itself to grade -- none of that can
 * safely happen in a browser context, since a client-side query includes the
 * raw response in the network tab regardless of what the JS return value
 * exposes. The intended wiring: the browser uses assessment-toolkit's
 * `createRestApiClient()` pointed at `app/api/assessments/...` route
 * handlers, and those route handlers call this client server-side.
 *
 * ID mapping note (the toolkit's `assessmentId` term is overloaded across
 * two of our tables):
 *   - `startSession`'s returned `assessmentId`, and every other method that
 *     takes `assessmentId` as a parameter (heartbeat/submitAnswer/
 *     invalidateSession/completeSession), maps to `attempts.id` -- one row
 *     per run of this assessment.
 *   - `getTiers(assessmentId)` maps to `assessments.id` -- the static
 *     definition -- since `assessment_tiers` belongs to the template, not a
 *     specific run. Pass the same `assessmentDefinitionId` given to this
 *     factory, not the value `startSession` returned.
 *
 * Known schema gaps (flagged, not silently worked around -- see comments at
 * each call site below):
 *   - `attempts` has no warning/infraction counter; `getStatus` always
 *     reports `infractionCount: 0` and `recordWarning` is a no-op.
 *   - `attempts` has no column to persist `invalidateSession`'s `reason`.
 */

interface QuestionRow {
  id: string
  type: "multiple_choice" | "true_false" | "yes_no" | "code_snippet"
  title: string
  description: string | null
  constraints: string | null
  sfia_level: number | null
  starter_code: string | null
  language: CodeLanguage | null
  tech_domain: string | null
}

interface ChoiceRow {
  id: number | string
  context: string
}

/** Shape of one attempt_answers row as returned by a `select("*")`-style query, after the 2026-10-02 column widening. */
export interface AttemptAnswerRecord {
  question_id: string
  raw_answer: Record<string, unknown> | null
  time_spent: number
  total_score: number | null
  score_correctness: number | null
  score_quality: number | null
  score_edge_case: number | null
  score_best_practice: number | null
  display_level: string | null
  display_level_description: string | null
  feedback: string | null
  chain_of_thought: string | null
  annotated_code: unknown
  guides: unknown
  sfia_level_assigned: number | null
  knowledge_gaps: unknown
}

/**
 * Turns one attempt_answers row back into the SubmissionResult shape the
 * browser originally received at submission time. Shared by startSession's
 * resume branch (below) and the Manager/Capability-Owner detail view
 * (lib/assessment/attempt-detail.ts) -- the same persistence gap blocked
 * both, so this is the one place that closes it.
 */
export function mapAttemptAnswerRowToSubmissionResult(
  row: AttemptAnswerRecord,
  question: { title: string; type: QuestionRow["type"] }
): SubmissionResult {
  const result: SubmissionResult = {
    questionId: row.question_id,
    questionTitle: question.title,
    totalScore: row.total_score ?? 0,
    timeSpentSeconds: row.time_spent,
  }
  if (row.display_level != null) result.displayLevel = row.display_level
  if (row.display_level_description != null) result.displayLevelDescription = row.display_level_description
  if (row.feedback != null) result.feedback = row.feedback
  if (row.chain_of_thought != null) result.chainOfThought = row.chain_of_thought
  if (row.score_correctness != null) {
    result.subScores = {
      correctness: row.score_correctness,
      quality: row.score_quality ?? 0,
      edgeCases: row.score_edge_case ?? 0,
      bestPractice: row.score_best_practice ?? 0,
    }
  }
  if (row.annotated_code != null) result.annotatedCode = row.annotated_code as AnnotatedCodeEntry[]
  if (row.guides != null) result.guides = row.guides as StudyGuide[]
  if (row.sfia_level_assigned != null) result.sfiaLevelAssigned = row.sfia_level_assigned
  if (row.knowledge_gaps != null) result.knowledgeGaps = row.knowledge_gaps as string[]
  if (question.type === "yes_no") {
    // raw_answer.value can legitimately be `false` -- only treat it as
    // "no value recorded" if the key itself is missing/null, never because
    // the stored boolean happens to be falsy.
    const value = (row.raw_answer as { value?: boolean | null } | null)?.value
    result.yesNoValue = value ?? undefined
  }
  return result
}

function mapQuestionRow(row: QuestionRow, choices: ChoiceRow[]): Question {
  const base = {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    constraints: row.constraints ?? undefined,
  }

  if (row.type === "code_snippet") {
    if (!row.language) {
      // Don't silently default this -- a wrong guessed language would grade
      // and render the exercise incorrectly. Backfill the row instead (see
      // supabase/migrations/2026-09-21_backfill_code_snippet_language.sql).
      throw new Error(`Question ${row.id} ("${row.title}") is a code_snippet question with no language set`)
    }
    return {
      ...base,
      type: "code_snippet",
      language: row.language,
      techDomain: row.tech_domain ?? undefined,
      starterCode: row.starter_code ?? undefined,
    }
  }

  if (row.type === "yes_no") {
    return {
      ...base,
      type: "yes_no",
      sfiaLevel: row.sfia_level ?? 1,
    }
  }

  return {
    ...base,
    type: row.type, // 'multiple_choice' | 'true_false'
    options: choices.map((c) => ({ id: String(c.id), text: c.context })),
  }
}

export function createSupabaseAssessmentApiClient(
  supabase: SupabaseClient,
  assessmentDefinitionId: number
): AssessmentApiClient {
  /** Defense in depth on top of RLS: fail loudly with a clear message rather than a silently-empty RLS result. */
  async function requireSelf(userId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.id !== userId) {
      throw new Error("userId does not match the authenticated user")
    }
  }

  async function latestAttempt(userId: string) {
    const { data, error } = await supabase
      .from("attempts")
      .select("id, status, started_at, completed_at, passed")
      .eq("assessment_id", assessmentDefinitionId)
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`Failed to load attempt: ${error.message}`)
    return data
  }

  /** Whether this user may start, resume, or is done with this assessment -- see attemptGate. */
  function gateFor(userId: string) {
    return loadAttemptGate(supabase, userId, assessmentDefinitionId)
  }

  /**
   * All attempt_answers for an attempt, in question-sequence order,
   * mapped back to SubmissionResult. Used only when startSession finds an
   * existing in_progress attempt -- a brand-new attempt has nothing to
   * load. Deliberately not filtered to active questions only (unlike
   * activeQuestionIds): a question answered before being deactivated
   * mid-attempt must still show up here so it isn't re-asked.
   */
  async function loadResumedAnswers(attemptId: number): Promise<SubmissionResult[]> {
    const { data: positionRows, error: positionError } = await supabase
      .from("assessment_questions")
      .select("question_id, position")
      .eq("assessment_id", assessmentDefinitionId)
    if (positionError) throw new Error(`Failed to load question order: ${positionError.message}`)
    const positionByQuestionId = new Map((positionRows ?? []).map((r) => [r.question_id as string, r.position as number]))

    const { data: answerRows, error: answersError } = await supabase
      .from("attempt_answers")
      .select(
        "question_id, raw_answer, time_spent, total_score, score_correctness, score_quality, score_edge_case, score_best_practice, display_level, display_level_description, feedback, chain_of_thought, annotated_code, guides, sfia_level_assigned, knowledge_gaps, questions(title, type)"
      )
      .eq("attempt_id", attemptId)
    if (answersError) throw new Error(`Failed to load resumed answers: ${answersError.message}`)

    return (answerRows ?? [])
      .map((row) => {
        // Supabase types a to-one embed as an array; it arrives as an object.
        const embedded: unknown = row.questions
        const question = (Array.isArray(embedded) ? embedded[0] : embedded) as
          | { title: string; type: QuestionRow["type"] }
          | null
        return mapAttemptAnswerRowToSubmissionResult(row as unknown as AttemptAnswerRecord, {
          title: question?.title ?? "Untitled question",
          // A missing question is mapped as graded (not yes/no), as before.
          type: question?.type ?? "multiple_choice",
        })
      })
      .sort((a, b) => (positionByQuestionId.get(a.questionId) ?? Infinity) - (positionByQuestionId.get(b.questionId) ?? Infinity))
  }

  /** Ordered question ids for this assessment, restricted to published (`active`) questions. */
  async function activeQuestionIds(): Promise<string[]> {
    const { data, error } = await supabase
      .from("assessment_questions")
      .select("question_id, position, questions!inner(status)")
      .eq("assessment_id", assessmentDefinitionId)
      .eq("questions.status", "active")
      .order("position", { ascending: true })
    if (error) throw new Error(`Failed to load question set: ${error.message}`)
    return (data ?? []).map((row) => row.question_id as string)
  }

  async function fetchQuestion(questionId: string): Promise<QuestionRow> {
    const { data, error } = await supabase
      .from("questions")
      .select("id, type, title, description, constraints, sfia_level, starter_code, language, tech_domain")
      .eq("id", questionId)
      .single()
    if (error || !data) throw new Error(`Question not found: ${questionId}`)
    return data as QuestionRow
  }

  async function fetchChoicesWithoutAnswerKey(questionId: string): Promise<ChoiceRow[]> {
    // Deliberately excludes is_correct -- see file header.
    const { data, error } = await supabase
      .from("question_choices")
      .select("id, context")
      .eq("question_id", questionId)
    if (error) throw new Error(`Failed to load choices: ${error.message}`)
    return data ?? []
  }

  async function getQuestionImpl(questionId: string): Promise<Question> {
    const row = await fetchQuestion(questionId)
    const choices =
      row.type === "multiple_choice" || row.type === "true_false"
        ? await fetchChoicesWithoutAnswerKey(questionId)
        : []
    return mapQuestionRow(row, choices)
  }

  async function getTiersImpl(assessmentId: number): Promise<AssessmentTier[]> {
    const { data, error } = await supabase
      .from("assessment_tiers")
      .select("sfia_level, label, applies_to, pass_threshold, advance_message, stay_message")
      .eq("assessment_id", assessmentId)
      .order("position", { ascending: true })
    if (error) throw new Error(`Failed to load tiers: ${error.message}`)
    return (data ?? []).map((row) => ({
      sfiaLevel: row.sfia_level,
      label: row.label,
      appliesTo: row.applies_to ?? undefined,
      passThreshold: Number(row.pass_threshold),
      advanceMessage: row.advance_message ?? undefined,
      stayMessage: row.stay_message ?? undefined,
    }))
  }

  return {
    async getStatus(userId, requestedAssessmentDefinitionId): Promise<AssessmentStatus> {
      await requireSelf(userId)
      // This factory is already scoped to one assessment definition at
      // construction time (via requireEmployeeAssessmentClient) -- the
      // interface-level parameter exists for hosts without that closure
      // pattern. Here it's a defense-in-depth check that the caller's id
      // and this client's bound id actually agree, not a second
      // resolution.
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }
      // One attempt per assessment: any finished attempt locks it.
      const gate = await gateFor(userId)
      return {
        isLockedOut: gate.kind === "finished",
        infractionCount: 0, // schema gap -- see file header
      }
    },

    async startSession(userId, requestedAssessmentDefinitionId): Promise<StartSessionResult> {
      await requireSelf(userId)
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }
      const questionCount = (await activeQuestionIds()).length
      const gate = await gateFor(userId)
      if (gate.kind === "resume") {
        const resumedAnswers = await loadResumedAnswers(gate.attemptId)
        return { assessmentId: String(gate.attemptId), resumedAnswers, questionCount }
      }
      if (gate.kind === "finished") throw new AttemptAlreadyFinishedError()
      const { data, error } = await supabase
        .from("attempts")
        .insert({ assessment_id: assessmentDefinitionId, profile_id: userId, status: "in_progress" })
        .select("id")
        .single()
      if (error) throw new Error(`Failed to start attempt: ${error.message}`)
      return { assessmentId: String(data.id), resumedAnswers: [], questionCount }
    },

    async heartbeat(assessmentId, userId, requestedAssessmentDefinitionId): Promise<HeartbeatResult> {
      await requireSelf(userId)
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }
      const { data, error } = await supabase
        .from("attempts")
        .select("status, started_at")
        .eq("id", assessmentId)
        .eq("profile_id", userId)
        .maybeSingle()
      if (error || !data || data.status !== "in_progress") {
        return heartbeatOutcome(error || !data ? null : { status: data.status, startedAt: data.started_at, durationMinutes: null }, Date.now())
      }

      const { data: assessment } = await supabase
        .from("assessments")
        .select("duration_minutes")
        .eq("id", assessmentDefinitionId)
        .maybeSingle()

      return heartbeatOutcome(
        { status: data.status, startedAt: data.started_at, durationMinutes: assessment?.duration_minutes ?? null },
        Date.now()
      )
    },

    async listQuestionIds() {
      return activeQuestionIds()
    },

    async getQuestion(questionId) {
      return getQuestionImpl(questionId)
    },

    async getTiers(assessmentId): Promise<AssessmentTier[]> {
      return getTiersImpl(Number(assessmentId))
    },

    async getNextQuestion(requestedAssessmentDefinitionId, attemptedIds, results) {
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }
      const ids = await activeQuestionIds()
      const nextId = ids.find((id) => !attemptedIds.includes(id))
      if (!nextId) return null

      if (results?.some((r) => r.yesNoValue !== undefined)) {
        const { data: yesNoRows, error } = await supabase
          .from("questions")
          .select("id, sfia_level")
          .eq("type", "yes_no")
          .in("id", ids)
        if (error) throw new Error(`Failed to load yes/no questions: ${error.message}`)

        const yesNoQuestions = (yesNoRows ?? [])
          .filter((q) => q.sfia_level != null)
          .map((q) => ({ id: q.id as string, sfiaLevel: q.sfia_level as number }))

        const tiers = await getTiersImpl(assessmentDefinitionId)
        if (shouldHaltAfterAnswer({ tiers, yesNoQuestions, attemptedIds, results })) {
          return null
        }
      }

      return getQuestionImpl(nextId)
    },

    async submitAnswer({ userId, question, answer, timeSpentSeconds, assessmentDefinitionId: requestedAssessmentDefinitionId }): Promise<SubmissionResult> {
      await requireSelf(userId)
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }

      // Don't trust the client-supplied `question`/`answer` shape for grading
      // truth -- re-fetch the canonical question row by id.
      const row = await fetchQuestion(question.id)

      const attemptRow = await latestAttempt(userId)
      if (!attemptRow) throw new Error("No active attempt found for this user")

      let result: SubmissionResult
      let rawAnswer: Record<string, unknown>
      let scores: {
        total_score: number | null
        score_correctness: number | null
        score_quality: number | null
        score_edge_case: number | null
        score_best_practice: number | null
      } = {
        total_score: null,
        score_correctness: null,
        score_quality: null,
        score_edge_case: null,
        score_best_practice: null,
      }

      if (row.type === "multiple_choice" || row.type === "true_false") {
        if (answer.type !== "multiple_choice" && answer.type !== "true_false") {
          throw new Error(`Answer type ${answer.type} does not match question type ${row.type}`)
        }
        const { data: correctChoice, error } = await supabase
          .from("question_choices")
          .select("id")
          .eq("question_id", row.id)
          .eq("is_correct", true)
          .maybeSingle()
        if (error) throw new Error(`Failed to load answer key: ${error.message}`)

        const graded = gradeMultipleChoiceSubmission({
          selectedOptionId: answer.selectedOptionId,
          correctOptionId: correctChoice ? String(correctChoice.id) : "",
        })

        scores.total_score = graded.totalScore
        rawAnswer = { selectedChoiceId: answer.selectedOptionId }
        result = {
          questionId: row.id,
          questionTitle: row.title,
          totalScore: graded.totalScore,
          displayLevel: graded.isCorrect ? "Correct" : "Incorrect",
          feedback: graded.isCorrect ? "Nice work." : "Not quite -- review the concept and try a similar question.",
          timeSpentSeconds,
        }
      } else if (row.type === "yes_no") {
        if (answer.type !== "yes_no") {
          throw new Error(`Answer type ${answer.type} does not match question type ${row.type}`)
        }
        rawAnswer = { value: answer.value }
        result = {
          questionId: row.id,
          questionTitle: row.title,
          totalScore: 0, // ungraded -- rolls up via evaluateYesNoLadder in completeSession
          timeSpentSeconds,
          yesNoValue: answer.value ?? undefined,
        }
      } else {
        if (answer.type !== "code_snippet") {
          throw new Error(`Answer type ${answer.type} does not match question type ${row.type}`)
        }
        if (!row.language) {
          throw new Error(`Question ${row.id} ("${row.title}") is a code_snippet question with no language set`)
        }
        const graded = await gradeCodeSubmission({
          title: row.title,
          language: row.language,
          techDomain: row.tech_domain ?? undefined,
          constraints: row.constraints ?? undefined,
          submittedCode: answer.code,
          compilationOutput: answer.compilationOutput,
        })

        scores = {
          total_score: graded.totalScore,
          score_correctness: graded.scoreCorrectness,
          score_quality: graded.scoreQuality,
          score_edge_case: graded.scoreEdgeCases,
          score_best_practice: graded.scoreBestPractice,
        }
        rawAnswer = { code: answer.code, compilationOutput: answer.compilationOutput }
        result = {
          questionId: row.id,
          questionTitle: row.title,
          totalScore: graded.totalScore,
          displayLevel: graded.displayLevel,
          displayLevelDescription: graded.displayLevelDescription,
          feedback: graded.feedback,
          chainOfThought: graded.chainOfThought,
          subScores: {
            correctness: graded.scoreCorrectness,
            quality: graded.scoreQuality,
            edgeCases: graded.scoreEdgeCases,
            bestPractice: graded.scoreBestPractice,
          },
          annotatedCode: graded.annotatedCode,
          guides: graded.recommendedStudyGuides,
          sfiaLevelAssigned: graded.sfia_level_assigned,
          knowledgeGaps: graded.knowledgeGaps,
          timeSpentSeconds,
        }
      }

      const { error: insertError } = await supabase.from("attempt_answers").insert({
        attempt_id: attemptRow.id,
        question_id: row.id,
        raw_answer: rawAnswer,
        time_spent: timeSpentSeconds,
        ...scores,
        display_level: result.displayLevel ?? null,
        display_level_description: result.displayLevelDescription ?? null,
        feedback: result.feedback ?? null,
        chain_of_thought: result.chainOfThought ?? null,
        annotated_code: result.annotatedCode ?? null,
        guides: result.guides ?? null,
        sfia_level_assigned: result.sfiaLevelAssigned ?? null,
        knowledge_gaps: result.knowledgeGaps ?? null,
      })
      if (insertError) throw new Error(`Failed to save answer: ${insertError.message}`)

      return result
    },

    async recordWarning() {
      // Schema gap: `attempts` has no warning/infraction counter column yet.
      // No-op until that's added -- see file header. Not persisted silently
      // as a workaround (e.g. abusing `tier_result`), since that column has
      // a documented, different shape.
    },

    async invalidateSession(assessmentId, userId, reason, requestedAssessmentDefinitionId) {
      await requireSelf(userId)
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }
      const { error } = await supabase
        .from("attempts")
        .update({ status: "invalidated", completed_at: new Date().toISOString() })
        .eq("id", assessmentId)
        .eq("profile_id", userId)
        // Never overwrite a finished attempt -- a late invalidate (e.g. a
        // heartbeat racing completeSession) must not void a completed one.
        .eq("status", "in_progress")
      if (error) throw new Error(`Failed to invalidate attempt: ${error.message}`)
      // `reason` isn't persisted -- schema gap, see file header.
      console.warn(`Attempt ${assessmentId} invalidated for user ${userId}: ${reason}`)
    },

    async completeSession(assessmentId, userId, results, requestedAssessmentDefinitionId) {
      await requireSelf(userId)
      if (Number(requestedAssessmentDefinitionId) !== assessmentDefinitionId) {
        throw new Error("assessmentDefinitionId does not match this client's bound assessment")
      }

      // Defense in depth: confirm this attempt belongs to this user and is
      // still in progress before doing anything else. `supabase` here is
      // the RLS-scoped per-request client, but the calibration step below
      // uses a service-role client with no such scoping (it needs to read
      // every respondent's answers) -- without this check it would happily
      // compute and return theta for an attempt id this user doesn't own.
      const { data: ownedAttempt, error: ownedAttemptError } = await supabase
        .from("attempts")
        .select("id")
        .eq("id", assessmentId)
        .eq("profile_id", userId)
        .eq("status", "in_progress")
        .maybeSingle()
      if (ownedAttemptError) {
        throw new Error(`Failed to verify attempt ownership: ${ownedAttemptError.message}`)
      }
      if (!ownedAttempt) {
        throw new Error(`Attempt ${assessmentId} is not an in-progress attempt owned by this user`)
      }

      const yesNoResults = results.filter((r) => r.yesNoValue !== undefined)
      let passed: boolean | null = null
      let tierResult: TierResult | null = null

      if (yesNoResults.length > 0) {
        // Ladder-style assessment: roll answers up per tier via each
        // question's sfia_level, then evaluate lowest-to-highest.
        const { data: questionRows, error } = await supabase
          .from("questions")
          .select("id, sfia_level")
          .in(
            "id",
            yesNoResults.map((r) => r.questionId)
          )
        if (error) throw new Error(`Failed to load tier questions: ${error.message}`)

        const sfiaLevelByQuestionId = new Map((questionRows ?? []).map((q) => [q.id, q.sfia_level as number]))
        const answersByTier = new Map<number, boolean[]>()
        for (const r of yesNoResults) {
          const level = sfiaLevelByQuestionId.get(r.questionId)
          if (level == null) continue
          const bucket = answersByTier.get(level) ?? []
          bucket.push(Boolean(r.yesNoValue))
          answersByTier.set(level, bucket)
        }

        // Which sfiaLevels currently have at least one active yes_no
        // question -- same query shape getNextQuestion already runs above.
        // Without this, buildTierResult would score a tier emptied of its
        // questions as an automatic fail, discarding every higher tier's
        // results -- the same divergence shouldHaltAfterAnswer already
        // guards against by skipping empty tiers.
        const activeIds = await activeQuestionIds()
        const { data: activeYesNoRows, error: activeYesNoError } = await supabase
          .from("questions")
          .select("sfia_level")
          .eq("type", "yes_no")
          .in("id", activeIds)
        if (activeYesNoError) {
          throw new Error(`Failed to load active yes/no questions: ${activeYesNoError.message}`)
        }
        const activeSfiaLevels = new Set(
          (activeYesNoRows ?? []).filter((q) => q.sfia_level != null).map((q) => q.sfia_level as number)
        )

        const tiers = await getTiersImpl(assessmentDefinitionId)
        tierResult = buildTierResult(tiers, answersByTier, activeSfiaLevels)
        passed = tierResult.tiers.every((t) => t.passed)
      } else {
        const { data: assessment } = await supabase
          .from("assessments")
          .select("passing_score")
          .eq("id", assessmentDefinitionId)
          .maybeSingle()

        if (assessment?.passing_score != null && results.length > 0) {
          const average = results.reduce((sum, r) => sum + r.totalScore, 0) / results.length
          passed = average >= Number(assessment.passing_score)
        }
      }

      // Write the primary result first -- status/passed must be recorded
      // even if the secondary calibration/theta step below fails. This
      // also means calibration below sees this attempt as 'completed',
      // which is correct: it's a real completed response and should count.
      const { error: completeError } = await supabase
        .from("attempts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          passed,
          tier_result: tierResult,
        })
        .eq("id", assessmentId)
        .eq("profile_id", userId)
      if (completeError) throw new Error(`Failed to complete attempt: ${completeError.message}`)

      // Best-effort: notifying this employee's managers and the
      // capability's owner must never cost them their already-recorded
      // result, mirroring the calibration/theta best-effort block below.
      // Uses the service-role client because the recipients' rows aren't
      // the caller's own -- the per-request supabase client's RLS
      // (own-rows-only) would reject this insert.
      try {
        const serviceClient = getServiceRoleClient()
        const { data: departmentRows } = await supabase
          .from("profile_departments")
          .select("department_id")
          .eq("profile_id", userId)
        const departmentIds = (departmentRows ?? []).map((d) => d.department_id as number)

        const { data: managerRows } = departmentIds.length
          ? await serviceClient
              .from("profile_departments")
              .select("profile_id")
              .in("department_id", departmentIds)
              .eq("status", "management")
          : { data: [] as { profile_id: string }[] }

        const { data: ownerRow } = await serviceClient
          .from("assessments")
          .select("capabilities(owner_id)")
          .eq("id", assessmentDefinitionId)
          .maybeSingle()
        const capability = Array.isArray(ownerRow?.capabilities) ? ownerRow.capabilities[0] : ownerRow?.capabilities
        const ownerId = (capability as { owner_id: string | null } | null | undefined)?.owner_id ?? null

        // One notification per person, even when someone is both a
        // manager and the owner -- a duplicate would trip the unique index
        // and fail the whole batch. Never notify the employee themselves.
        const recipientIds = Array.from(
          new Set([...(managerRows ?? []).map((m) => m.profile_id as string), ...(ownerId ? [ownerId] : [])])
        ).filter((id) => id !== userId)

        if (recipientIds.length > 0) {
          // Plain insert, not upsert: notifications_attempt_completed_unique
          // is a *partial* unique index (where type = 'attempt_completed'),
          // and supabase-js's on_conflict can't restate that predicate for
          // ON CONFLICT inference against a partial index. A caught 23505
          // means they were already notified for this attempt -- benign,
          // not a failure.
          const { error: notifyError } = await serviceClient.from("notifications").insert(
            recipientIds.map((recipientId) => ({
              profile_id: recipientId,
              type: "attempt_completed" as const,
              assessment_id: assessmentDefinitionId,
              attempt_id: assessmentId, // assessmentId here is attempts.id -- see this file's ID-overloading note
            }))
          )
          if (notifyError && notifyError.code !== "23505") {
            throw notifyError
          }
        }
      } catch (err) {
        console.error(`completeSession: completion notification failed for attempt ${assessmentId}:`, err)
      }

      // Calibration/theta runs whenever the attempt has at least one graded
      // (non-yes/no) answer -- including mixed assessments that also contain
      // yes/no questions, whose ladder result is handled above. yes/no
      // questions themselves are never calibrated (calibrateQuestion and
      // computeAttemptTheta both skip them). Best-effort: a calibration
      // failure must not cost the employee their already-recorded
      // pass/fail result, so it's caught and falls back to null rather
      // than propagating. Question ids are read from this attempt's own
      // answers (not the client-supplied `results`), so a caller can't
      // use this path to trigger recalibration of arbitrary questions.
      let thetaEstimate: number | null = null
      let thetaSe: number | null = null
      if (shouldComputeTheta(results)) {
        try {
          const { data: answeredRows, error: answeredError } = await supabase
            .from("attempt_answers")
            .select("question_id")
            .eq("attempt_id", assessmentId)
          if (answeredError) throw new Error(`Failed to load answered questions: ${answeredError.message}`)

          const distinctQuestionIds = [...new Set((answeredRows ?? []).map((r) => r.question_id as string))]
          for (const questionId of distinctQuestionIds) {
            await calibrateQuestion(questionId)
          }
          const theta = await computeAttemptTheta(assessmentId)
          thetaEstimate = theta.thetaEstimate
          thetaSe = theta.thetaSe

          const { error: thetaError } = await supabase
            .from("attempts")
            .update({ theta_estimate: thetaEstimate, theta_se: thetaSe })
            .eq("id", assessmentId)
            .eq("profile_id", userId)
          if (thetaError) throw new Error(`Failed to write theta: ${thetaError.message}`)
        } catch (err) {
          console.error(`completeSession: calibration/theta failed for attempt ${assessmentId}:`, err)
          thetaEstimate = null
          thetaSe = null
        }
      }

      return { thetaEstimate, thetaSe, tierResult }
    },
  }
}
