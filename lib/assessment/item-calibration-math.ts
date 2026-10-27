/**
 * Pure classical-test-theory -> IRT-proxy conversion math, plus the
 * Expected-A-Posteriori (EAP) theta estimator and the rapid-guessing
 * data-quality filter. No Supabase, no I/O -- see
 * docs/superpowers/specs/2026-10-01-item-calibration-theta-scoring-design.md
 * for the formulas and citations this implements. calibrate-question.ts is
 * the only caller.
 */

/**
 * Minimum qualifying responses before a question is considered
 * calibratable, and before the rapid-guessing filter's relative-mean rule
 * activates for that question (a question with fewer responses has no
 * stable mean response time to be relative to).
 */
export const MIN_CALIBRATION_N = 5

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Logistic-ogive discrimination conversion: a = 1.7r / sqrt(1 - r^2),
 * clamped to [0.3, 2.5]. r is clamped away from +-1 first so a
 * near-perfect correlation (possible at low n) can't divide by ~0.
 */
export function computeDiscrimination(itemRestCorrelation: number): number {
  const r = clamp(itemRestCorrelation, -0.98, 0.98)
  const a = (1.7 * r) / Math.sqrt(1 - r * r)
  return clamp(a, 0.3, 2.5)
}

/**
 * Difficulty conversion: b = -ln(p / (1 - p)) / a. `proportion` is
 * clamped to [0.01, 0.99] first -- an unclamped p of exactly 0 or 1
 * (everyone wrong, or everyone right -- common at low n) sends
 * ln(p / (1 - p)) to +-Infinity.
 */
export function computeDifficulty(proportion: number, discrimination: number): number {
  const p = clamp(proportion, 0.01, 0.99)
  return -Math.log(p / (1 - p)) / discrimination
}

/**
 * Pearson correlation. Returns 0 (no discrimination signal) rather than
 * NaN when either series has zero variance, or the series are empty/of
 * mismatched length.
 */
export function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n === 0 || n !== ys.length) return 0
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n
  let numerator = 0
  let sumSqX = 0
  let sumSqY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    numerator += dx * dy
    sumSqX += dx * dx
    sumSqY += dy * dy
  }
  if (sumSqX === 0 || sumSqY === 0) return 0
  return numerator / Math.sqrt(sumSqX * sumSqY)
}

/**
 * Wise & Kong's Response Time Effort filter. Callers pass response times
 * in chronological order (e.g. by attempt_answers.id ascending); "prior"
 * below means chronologically earlier for the same question. Returns one
 * boolean per input, true meaning "exclude this response from
 * calibration." A response is excluded if time_spent < 2 seconds
 * (always), or -- once MIN_CALIBRATION_N qualifying responses already
 * precede it -- if time_spent < 10% of the mean time_spent across those
 * prior qualifying responses.
 */
export function filterRapidGuesses(timesSpentSeconds: number[]): boolean[] {
  const qualifying: number[] = []
  const excluded: boolean[] = []
  for (const t of timesSpentSeconds) {
    let isExcluded = t < 2
    if (!isExcluded && qualifying.length >= MIN_CALIBRATION_N) {
      const mean = qualifying.reduce((sum, x) => sum + x, 0) / qualifying.length
      isExcluded = t < 0.1 * mean
    }
    excluded.push(isExcluded)
    if (!isExcluded) qualifying.push(t)
  }
  return excluded
}

// --- EAP theta estimation ---------------------------------------------------

export interface EapDichotomousItem {
  kind: 'dichotomous'
  isCorrect: boolean
  a: number
  b: number
}

export interface EapGrmItem {
  kind: 'grm'
  /** 1-4, per scoreToGrmCategory. */
  category: 1 | 2 | 3 | 4
  a: number
  /** Exactly 3 thresholds (b2, b3, b4), per the code_snippet GRM design. */
  bThresholds: [number, number, number]
}

export type EapItemInput = EapDichotomousItem | EapGrmItem

function dichotomousProbability(isCorrect: boolean, a: number, b: number, theta: number): number {
  const pCorrect = 1 / (1 + Math.exp(-a * (theta - b)))
  return isCorrect ? pCorrect : 1 - pCorrect
}

/** P*(score >= category) via the GRM boundary curve. P*(>=1) = 1 and P*(>=5) = 0 by definition. */
function grmAtLeastProbability(category: number, a: number, bThresholds: [number, number, number], theta: number): number {
  if (category <= 1) return 1
  if (category > bThresholds.length + 1) return 0
  const b = bThresholds[category - 2]
  return 1 / (1 + Math.exp(-a * (theta - b)))
}

function grmCategoryProbability(item: EapGrmItem, theta: number): number {
  const { category, a, bThresholds } = item
  return grmAtLeastProbability(category, a, bThresholds, theta) - grmAtLeastProbability(category + 1, a, bThresholds, theta)
}

function responseProbability(item: EapItemInput, theta: number): number {
  const p = item.kind === 'dichotomous'
    ? dichotomousProbability(item.isCorrect, item.a, item.b, theta)
    : grmCategoryProbability(item, theta)
  // Floor away from exactly 0 -- an empty GRM category (nobody in the
  // calibration pool landed there) makes this term exactly 0, which would
  // zero out the whole likelihood product below and turn theta into NaN.
  return Math.max(p, 1e-9)
}

const THETA_GRID_MIN = -4
const THETA_GRID_MAX = 4
const THETA_GRID_STEP = 0.1

/**
 * Expected-A-Posteriori estimate over a standard-normal prior and the
 * given items' logistic response probabilities. Returns null when
 * `items` is empty -- there's nothing to estimate from yet.
 */
export function computeEapTheta(items: EapItemInput[]): { thetaEstimate: number; thetaSe: number } | null {
  if (items.length === 0) return null

  const thetas: number[] = []
  for (let t = THETA_GRID_MIN; t <= THETA_GRID_MAX + 1e-9; t += THETA_GRID_STEP) {
    thetas.push(Math.round(t * 1000) / 1000)
  }

  const weights = thetas.map((theta) => {
    const prior = Math.exp(-(theta * theta) / 2)
    const likelihood = items.reduce((product, item) => product * responseProbability(item, theta), 1)
    return prior * likelihood
  })

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    console.error('computeEapTheta: totalWeight is not finite/positive -- returning null', { totalWeight, items })
    return null
  }
  const probabilities = weights.map((w) => w / totalWeight)

  const mean = thetas.reduce((sum, t, i) => sum + t * probabilities[i], 0)
  const variance = thetas.reduce((sum, t, i) => sum + probabilities[i] * (t - mean) * (t - mean), 0)

  return { thetaEstimate: mean, thetaSe: Math.sqrt(variance) }
}
