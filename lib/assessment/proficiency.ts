import type { TierResult } from "@assessment-toolkit/core"
import { achievedTierFromTierResult } from "@assessment-toolkit/core/server"

/** One finished ladder result, labelled as it was when earned. */
export interface LevelResult {
  sfiaLevel: number
  label: string
  message: string | null
  completedAt: string
  assessmentName: string
  attemptId: number
}

export interface ProficiencyAttempt {
  id: number
  status: string
  completed_at: string | null
  tier_result: unknown
  assessment_name: string
}

/**
 * Pure, no I/O. An employee's level for one capability, derived from their
 * finished ladder attempts (never stored). The newest result is current,
 * whichever assessment it came from; labels come from each attempt's own
 * tier_result snapshot, so later ladder edits don't rename past results.
 */
export function currentProficiency(attempts: ProficiencyAttempt[]): {
  current: LevelResult | null
  history: LevelResult[]
} {
  const history = attempts
    .filter((a) => a.status === "completed" && a.completed_at)
    .flatMap((a) => {
      const tierResult = a.tier_result as TierResult | null
      const achieved = achievedTierFromTierResult(tierResult)
      if (!achieved) return []
      return [
        {
          sfiaLevel: achieved.sfiaLevel,
          label: achieved.label,
          message: tierResult?.message ?? null,
          completedAt: a.completed_at as string,
          assessmentName: a.assessment_name,
          attemptId: a.id,
        },
      ]
    })
    .sort((x, y) => Date.parse(y.completedAt) - Date.parse(x.completedAt) || y.attemptId - x.attemptId)
  return { current: history[0] ?? null, history }
}
