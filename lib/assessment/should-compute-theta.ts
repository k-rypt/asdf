/**
 * Whether completeSession should calibrate questions and estimate θ for an
 * attempt. θ comes only from graded (multiple-choice / true-false / code)
 * answers -- yes/no ladder answers are never calibrated -- so it's worth
 * computing whenever the attempt has at least one graded answer, including
 * mixed assessments that also contain yes/no questions. A pure ladder
 * attempt has nothing to estimate from.
 */
export function shouldComputeTheta(results: { yesNoValue?: boolean }[]): boolean {
  return results.some((r) => r.yesNoValue === undefined)
}
