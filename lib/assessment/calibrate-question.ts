import "server-only"
import { createClient } from "@supabase/supabase-js"
import { scoreToGrmCategory } from "@assessment-toolkit/core/server"
import {
  MIN_CALIBRATION_N,
  computeDifficulty,
  computeDiscrimination,
  computeEapTheta,
  filterRapidGuesses,
  pearsonCorrelation,
  type EapItemInput,
} from "./item-calibration-math"

/**
 * Calibration needs to read every respondent's attempt_answers for a
 * question to compute aggregate stats, which the answering employee's own
 * RLS-scoped session can't do (attempt_answers policies only allow
 * reading your own rows). Mirrors app/api/admin/users/invite/route.ts's
 * getAdminClient() -- no shared service-role helper exists yet in this
 * codebase.
 */
function getCalibrationClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

interface AnswerRow {
  id: number
  attempt_id: number
  total_score: number | null
  time_spent: number | null
}

/**
 * Recomputes irt_a/irt_b_thresholds/calibration_method/calibration_n/
 * last_calibrated_at for one question from every `completed` attempt's
 * answers, applying the rapid-guessing filter. No-op (leaves the question
 * at whatever calibration state it already has) for yes_no questions, or
 * when fewer than MIN_CALIBRATION_N qualifying responses exist -- n only
 * grows over time (responses are never deleted), so a question that
 * already cleared the threshold can't fall back below it.
 */
export async function calibrateQuestion(questionId: string): Promise<void> {
  const supabase = getCalibrationClient()

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("id, type")
    .eq("id", questionId)
    .single()
  if (questionError || !question) {
    throw new Error(`calibrateQuestion: failed to load question ${questionId}: ${questionError?.message}`)
  }
  if (question.type === "yes_no") return // out of scope -- see spec's "Scope" section

  const { data: rows, error: answersError } = await supabase
    .from("attempt_answers")
    .select("id, attempt_id, total_score, time_spent, attempts!inner(status)")
    .eq("question_id", questionId)
    .eq("attempts.status", "completed")
    .order("id", { ascending: true })
  if (answersError) {
    throw new Error(`calibrateQuestion: failed to load responses for ${questionId}: ${answersError.message}`)
  }
  if ((rows ?? []).length >= 1000) {
    console.warn(
      `calibrateQuestion: answers query for question ${questionId} returned >= 1000 rows -- likely truncated by PostgREST's row cap, calibration may be computed on stale/partial data`
    )
  }

  const answered = (rows ?? []) as unknown as AnswerRow[]
  const excluded = filterRapidGuesses(answered.map((r) => Number(r.time_spent) || 0))
  const qualifying = answered.filter((_, i) => !excluded[i])

  if (qualifying.length < MIN_CALIBRATION_N) return

  // Item-rest correlation needs each qualifying attempt's average score on
  // every *other* question it answered. One extra query for all answers
  // belonging to these attempts, instead of one query per attempt.
  const attemptIds = [...new Set(qualifying.map((r) => r.attempt_id))]
  const { data: allAnswers, error: restError } = await supabase
    .from("attempt_answers")
    .select("attempt_id, question_id, total_score")
    .in("attempt_id", attemptIds)
  if (restError) {
    throw new Error(`calibrateQuestion: failed to load rest-scores for ${questionId}: ${restError.message}`)
  }
  if ((allAnswers ?? []).length >= 1000) {
    console.warn(
      `calibrateQuestion: rest-score query for question ${questionId} returned >= 1000 rows -- likely truncated by PostgREST's row cap, item-rest correlation may be computed on partial data`
    )
  }

  function restScore(attemptId: number): number | null {
    const others = (allAnswers ?? []).filter(
      (a) => a.attempt_id === attemptId && a.question_id !== questionId && a.total_score != null
    )
    if (others.length === 0) return null
    return others.reduce((sum, a) => sum + Number(a.total_score), 0) / others.length
  }

  const itemScores: number[] = []
  const restScores: number[] = []
  for (const row of qualifying) {
    const rest = restScore(row.attempt_id)
    if (rest === null) continue // nothing to correlate against -- excluded from r, still counted in n/p below
    itemScores.push(Number(row.total_score) || 0)
    restScores.push(rest)
  }
  const r = pearsonCorrelation(itemScores, restScores)
  const a = computeDiscrimination(r)

  let irtBThresholds: number[]
  if (question.type === "code_snippet") {
    const categories = qualifying.map((row) => scoreToGrmCategory(Number(row.total_score) || 0))
    irtBThresholds = [2, 3, 4].map((k) => {
      const pK = categories.filter((c) => c >= k).length / categories.length
      return computeDifficulty(pK, a)
    })
  } else {
    const p = qualifying.reduce((sum, row) => sum + (Number(row.total_score) || 0) / 100, 0) / qualifying.length
    irtBThresholds = [computeDifficulty(p, a)]
  }

  const { error: updateError } = await supabase
    .from("questions")
    .update({
      irt_a: a,
      irt_b_thresholds: irtBThresholds,
      calibration_method: "classical",
      calibration_n: qualifying.length,
      last_calibrated_at: new Date().toISOString(),
    })
    .eq("id", questionId)
  if (updateError) {
    throw new Error(`calibrateQuestion: failed to write calibration for ${questionId}: ${updateError.message}`)
  }
}

interface AnsweredQuestionRow {
  question_id: string
  total_score: number | null
  questions: {
    type: "multiple_choice" | "true_false" | "code_snippet" | "yes_no"
    irt_a: number | null
    irt_b_thresholds: number[] | null
    calibration_method: string
  }
}

/**
 * EAP theta over this attempt's answered items that are currently
 * calibration_method = 'classical'. Returns { null, null } when zero such
 * items exist -- there's nothing to estimate from yet.
 */
export async function computeAttemptTheta(
  attemptId: string | number
): Promise<{ thetaEstimate: number | null; thetaSe: number | null }> {
  const supabase = getCalibrationClient()

  const { data: rows, error } = await supabase
    .from("attempt_answers")
    .select("question_id, total_score, questions!inner(type, irt_a, irt_b_thresholds, calibration_method)")
    .eq("attempt_id", attemptId)
  if (error) {
    throw new Error(`computeAttemptTheta: failed to load answers for attempt ${attemptId}: ${error.message}`)
  }

  const items: EapItemInput[] = []
  for (const row of (rows ?? []) as unknown as AnsweredQuestionRow[]) {
    const q = row.questions
    if (q.calibration_method !== "classical" || q.irt_a == null || !Array.isArray(q.irt_b_thresholds) || q.irt_b_thresholds.length === 0) {
      continue
    }
    const a = Number(q.irt_a)
    const bThresholds = q.irt_b_thresholds.map(Number)
    const totalScore = Number(row.total_score) || 0

    if (q.type === "code_snippet" && bThresholds.length === 3) {
      items.push({
        kind: "grm",
        category: scoreToGrmCategory(totalScore),
        a,
        bThresholds: bThresholds as [number, number, number],
      })
    } else if (q.type === "multiple_choice" || q.type === "true_false") {
      items.push({ kind: "dichotomous", isCorrect: totalScore > 0, a, b: bThresholds[0] })
    }
    // yes_no is never calibrated (guarded in calibrateQuestion above), so it never reaches here.
  }

  const eap = computeEapTheta(items)
  return eap ? { thetaEstimate: eap.thetaEstimate, thetaSe: eap.thetaSe } : { thetaEstimate: null, thetaSe: null }
}
