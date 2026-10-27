import type { AssessmentTier, SubmissionResult, TierEvaluationResult, TierResult } from '../types';

/**
 * Deterministic (non-AI) evaluator for a yes/no self-assessment tier --
 * no grading happens per-question; instead, once every yes_no question
 * belonging to a tier has been answered, roll the boolean answers up
 * into a pass/fail against that tier's passThreshold (e.g. >=60% yes).
 *
 * Run server-side only, same as gradeMultipleChoiceSubmission -- keeps
 * passThreshold/advanceMessage/stayMessage authoring out of the client
 * bundle even though nothing here is secret, for consistency with how
 * the rest of this package separates grading logic from the UI.
 */
export function evaluateYesNoTier(tier: AssessmentTier, answers: boolean[]): TierEvaluationResult {
  const totalCount = answers.length;
  const yesCount = answers.filter(Boolean).length;
  const ratio = totalCount === 0 ? 0 : yesCount / totalCount;
  const passed = ratio >= tier.passThreshold;

  return {
    sfiaLevel: tier.sfiaLevel,
    label: tier.label,
    passed,
    yesCount,
    totalCount,
    message: passed ? tier.advanceMessage : tier.stayMessage,
  };
}

/**
 * Walks tiers in order (lowest sfiaLevel first) and returns the highest
 * tier the employee cleared, stopping at the first tier they don't pass
 * -- matches the ladder's own "if NO to most, stay here" logic instead
 * of grading every tier independently.
 */
export function evaluateYesNoLadder(
  tiers: AssessmentTier[],
  answersByTier: Map<number, boolean[]>
): TierEvaluationResult[] {
  const sorted = [...tiers].sort((a, b) => a.sfiaLevel - b.sfiaLevel);
  const results: TierEvaluationResult[] = [];

  for (const tier of sorted) {
    const answers = answersByTier.get(tier.sfiaLevel) ?? [];
    const result = evaluateYesNoTier(tier, answers);
    results.push(result);
    if (!result.passed) break;
  }

  return results;
}

/**
 * `activeSfiaLevels`, when provided, restricts evaluation to tiers whose
 * sfiaLevel has at least one currently-active yes_no question -- mirrors
 * shouldHaltAfterAnswer's own `if (tierQuestionIds.length === 0) continue`
 * skip, so a tier emptied of its questions (e.g. via the Review page's
 * per-question delete) is skipped here too instead of being scored as an
 * automatic fail that discards every higher tier. Omitted = no filtering
 * (today's behavior), so existing callers/tests are unaffected.
 */
export function buildTierResult(
  tiers: AssessmentTier[],
  answersByTier: Map<number, boolean[]>,
  activeSfiaLevels?: Set<number>
): TierResult {
  const relevantTiers = activeSfiaLevels ? tiers.filter((t) => activeSfiaLevels.has(t.sfiaLevel)) : tiers;
  const tierEvaluations = evaluateYesNoLadder(relevantTiers, answersByTier);
  const achieved = [...tierEvaluations].reverse().find((t) => t.passed);
  return {
    achievedSfiaLevel: achieved?.sfiaLevel ?? 0,
    message: tierEvaluations.at(-1)?.message,
    tiers: tierEvaluations,
  };
}

export function achievedTierFromTierResult(
  tierResult: TierResult | null | undefined
): { sfiaLevel: number; label: string } | null {
  if (!tierResult) return null;
  // `tier_result` is a jsonb column -- a row written before this plan's
  // camelCase refactor may still carry the legacy `achieved_sfia_level` key
  // instead of `achievedSfiaLevel`. Read either, so old rows resolve
  // correctly instead of silently falling through to null for the wrong
  // reason.
  const legacy = tierResult as unknown as { achieved_sfia_level?: number };
  const achievedSfiaLevel = tierResult.achievedSfiaLevel ?? legacy.achieved_sfia_level ?? 0;
  if (achievedSfiaLevel === 0) {
    // Stopped at the first level: name it after that level ("Below P1"),
    // using the short code before the first dash in its label.
    const lowest = [...tierResult.tiers].sort((a, b) => a.sfiaLevel - b.sfiaLevel)[0];
    if (!lowest) return null;
    return { sfiaLevel: 0, label: `Below ${lowest.label.split(/\s+[–—-]+\s+/)[0]}` };
  }
  const match = tierResult.tiers.find((t) => t.sfiaLevel === achievedSfiaLevel);
  return match ? { sfiaLevel: match.sfiaLevel, label: match.label } : null;
}

export interface HaltCheckParams {
  tiers: AssessmentTier[];
  yesNoQuestions: Array<{ id: string; sfiaLevel: number }>;
  attemptedIds: string[];
  results: SubmissionResult[];
}

export function shouldHaltAfterAnswer(params: HaltCheckParams): boolean {
  const { tiers, yesNoQuestions, attemptedIds, results } = params;
  const answerByQuestionId = new Map(
    results.filter((r) => r.yesNoValue !== undefined).map((r) => [r.questionId, Boolean(r.yesNoValue)])
  );
  // Tier membership is matched by sfiaLevel, never by the order
  // yesNoQuestions/tiers happen to arrive in -- interleaved or
  // out-of-order question sets must not break this.
  const sortedTiers = [...tiers].sort((a, b) => a.sfiaLevel - b.sfiaLevel);

  for (const tier of sortedTiers) {
    const tierQuestionIds = yesNoQuestions.filter((q) => q.sfiaLevel === tier.sfiaLevel).map((q) => q.id);
    if (tierQuestionIds.length === 0) continue;

    const allAnswered = tierQuestionIds.every((id) => attemptedIds.includes(id));
    if (!allAnswered) return false;

    const answers = tierQuestionIds.map((id) => answerByQuestionId.get(id) ?? false);
    const { passed } = evaluateYesNoTier(tier, answers);
    if (!passed) return true;
  }
  // Every tier with questions was fully answered and passed -- this is
  // normal ladder completion, not a halt.
  return false;
}
