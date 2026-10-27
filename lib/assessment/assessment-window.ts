export type AssessmentWindowState = "not_yet" | "available" | "expired"

export interface AssessmentWindowResult {
  state: AssessmentWindowState
  /** ISO timestamp, null only if `availableFrom` is null. */
  effectiveFrom: string | null
  /** ISO timestamp, null means no expiry. */
  effectiveUntil: string | null
}

export interface AssessmentWindowParams {
  availableFrom: string | null
  availableUntil: string | null
  addedAt: string
  now?: Date
}

/**
 * Pure, no I/O -- see the spec's "Per-employee window computation".
 *
 * effectiveFrom is the later of the assessment's own available_from and
 * the employee's profile_capabilities.added_at, so a late joiner never
 * gets less notice than an existing employee ("opens today", not "opens
 * three days ago"). effectiveUntil is always the assessment's own
 * available_until, never extended per employee -- extending it per
 * employee would mean an assessment could never actually close as long
 * as new hires kept joining, which defeats "auto-expire" as a concept.
 * The accepted trade-off: an employee assigned after available_until has
 * already passed can never take that published assessment; they see
 * "not currently available" until the owner publishes a fresh run.
 *
 * A malformed `addedAt` isn't special-cased (the column is
 * `not null default now()`, so this shouldn't happen) -- per the spec's
 * Error handling section, whatever this does on bad input is accepted as
 * out of scope rather than guarded against.
 */
export function computeAssessmentWindow(params: AssessmentWindowParams): AssessmentWindowResult {
  const now = params.now ?? new Date()

  const effectiveFrom =
    params.availableFrom == null
      ? null
      : new Date(
          Math.max(new Date(params.availableFrom).getTime(), new Date(params.addedAt).getTime())
        ).toISOString()

  const effectiveUntil = params.availableUntil

  let state: AssessmentWindowState = "available"
  if (effectiveFrom != null && now.getTime() < new Date(effectiveFrom).getTime()) {
    state = "not_yet"
  } else if (effectiveUntil != null && now.getTime() > new Date(effectiveUntil).getTime()) {
    state = "expired"
  }

  return { state, effectiveFrom, effectiveUntil }
}
