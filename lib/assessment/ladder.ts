/**
 * Pure, no I/O. Rules for the one-per-capability self-assessment ladder
 * (capability_ladder_levels) and its per-assessment copy (assessment_tiers).
 * Spec: docs/superpowers/specs/2026-10-24-add-questions-and-capability-ladder-design.md
 */

export type QuestionKind = "multiple_choice" | "true_false" | "code_snippet" | "yes_no"

export const QUESTION_KINDS: { value: QuestionKind; label: string }[] = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "code_snippet", label: "Code snippet" },
  { value: "yes_no", label: "Yes/No ladder" },
]

export interface LadderLevel {
  sfiaLevel: number
  label: string
  appliesTo: string | null
  /** 0-1 fraction of "yes" answers needed to move up. */
  passThreshold: number
  advanceMessage: string | null
  stayMessage: string | null
}

export interface TierSnapshotRow {
  assessment_id: number
  sfia_level: number
  label: string
  applies_to: string | null
  pass_threshold: number
  advance_message: string | null
  stay_message: string | null
  position: number
}

export const LEVEL_COLUMNS = "sfia_level, label, applies_to, pass_threshold, advance_message, stay_message"

/** Snapshots are only re-copied while nobody can be taking the assessment. */
export const EDITABLE_ASSESSMENT_STATUSES = ["draft", "pending_approval", "rejected"] as const

const MAX_TEXT = 500

/** A ladder question and graded questions never share an assessment. */
export function isKindDisabled(selected: ReadonlySet<QuestionKind>, kind: QuestionKind): boolean {
  if (kind === "yes_no") return Array.from(selected).some((k) => k !== "yes_no")
  return selected.has("yes_no")
}

export function rowToLevel(row: {
  sfia_level: number
  label: string
  applies_to: string | null
  pass_threshold: number | string
  advance_message: string | null
  stay_message: string | null
}): LadderLevel {
  return {
    sfiaLevel: row.sfia_level,
    label: row.label,
    appliesTo: row.applies_to,
    passThreshold: Number(row.pass_threshold),
    advanceMessage: row.advance_message,
    stayMessage: row.stay_message,
  }
}

export function levelToRow(capabilityId: number, level: LadderLevel, userId: string) {
  return {
    capability_id: capabilityId,
    sfia_level: level.sfiaLevel,
    label: level.label,
    applies_to: level.appliesTo,
    pass_threshold: level.passThreshold,
    advance_message: level.advanceMessage,
    stay_message: level.stayMessage,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
}

/** Validates a level's settings from a request body. Blank optional text becomes null. */
export function parseLadderLevelInput(
  input: unknown,
  sfiaLevel: number
): { ok: true; level: LadderLevel } | { ok: false; error: string } {
  const b = (input ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const label = text(b.label)
  const appliesTo = text(b.appliesTo)
  const advanceMessage = text(b.advanceMessage)
  const stayMessage = text(b.stayMessage)

  if (!label) return { ok: false, error: 'Give this level a name, e.g. "P1 – Beginner / Follow".' }
  const rawThreshold = b.passThreshold
  const blankThreshold =
    rawThreshold === undefined || rawThreshold === null || (typeof rawThreshold === "string" && rawThreshold.trim() === "")
  const passThreshold = blankThreshold ? 0.6 : Number(rawThreshold)
  if (!Number.isFinite(passThreshold) || passThreshold < 0 || passThreshold > 1) {
    return { ok: false, error: "Pass threshold must be between 0% and 100%." }
  }
  if ([label, appliesTo, advanceMessage, stayMessage].some((v) => v.length > MAX_TEXT)) {
    return { ok: false, error: `Keep each field under ${MAX_TEXT} characters.` }
  }
  return {
    ok: true,
    level: {
      sfiaLevel,
      label,
      appliesTo: appliesTo || null,
      passThreshold,
      advanceMessage: advanceMessage || null,
      stayMessage: stayMessage || null,
    },
  }
}

/** AI-drafted levels only fill gaps -- an owner's existing level is never overwritten. */
export function mergeLadderLevels(
  existing: LadderLevel[],
  drafted: LadderLevel[]
): { add: LadderLevel[]; kept: number[] } {
  const have = new Set(existing.map((l) => l.sfiaLevel))
  const seen = new Set<number>()
  const add: LadderLevel[] = []
  const kept: number[] = []
  for (const l of drafted) {
    if (seen.has(l.sfiaLevel)) continue
    seen.add(l.sfiaLevel)
    if (have.has(l.sfiaLevel)) kept.push(l.sfiaLevel)
    else add.push(l)
  }
  return { add, kept: kept.sort((a, b) => a - b) }
}

/** The assessment_tiers rows for an assessment whose yes/no questions sit at `usedLevels`. */
export function planTierSnapshot(
  assessmentId: number,
  ladder: LadderLevel[],
  usedLevels: number[]
): { rows: TierSnapshotRow[]; missingLevels: number[] } {
  const used = Array.from(new Set(usedLevels)).sort((a, b) => a - b)
  const byLevel = new Map(ladder.map((l) => [l.sfiaLevel, l]))
  const rows: TierSnapshotRow[] = []
  const missingLevels: number[] = []
  for (const sfiaLevel of used) {
    const l = byLevel.get(sfiaLevel)
    if (!l) {
      missingLevels.push(sfiaLevel)
      continue
    }
    rows.push({
      assessment_id: assessmentId,
      sfia_level: l.sfiaLevel,
      label: l.label,
      applies_to: l.appliesTo,
      pass_threshold: l.passThreshold,
      advance_message: l.advanceMessage,
      stay_message: l.stayMessage,
      position: rows.length,
    })
  }
  return { rows, missingLevels }
}

export function canSyncTiers(status: string | null | undefined): boolean {
  return (EDITABLE_ASSESSMENT_STATUSES as readonly string[]).includes(status ?? "")
}

/** Levels used by an assessment's yes/no questions that have no assessment_tiers row (deduped, ascending). */
export function missingTierLevels(questionLevels: number[], tierLevels: number[]): number[] {
  const have = new Set(tierLevels)
  return Array.from(new Set(questionLevels))
    .filter((l) => !have.has(l))
    .sort((a, b) => a - b)
}

/** e.g. "Set up SFIA 3, 5 in the Self-assessment ladder before publishing." */
export function missingLevelsMessage(levels: number[], suffix: "before publishing" | "first"): string {
  return `Set up SFIA ${levels.join(", ")} in the Self-assessment ladder ${suffix}.`
}

const KNOWN_KINDS = new Set<string>(QUESTION_KINDS.map((k) => k.value))

/** A questions.type as a QuestionKind; any type we don't know counts as graded. */
export function toQuestionKind(type: string): QuestionKind {
  return KNOWN_KINDS.has(type) ? (type as QuestionKind) : "multiple_choice"
}

/** True when a set of question types has both yes/no ladder questions and graded ones. */
export function mixesLadderAndGraded(types: string[]): boolean {
  const kinds = types.map(toQuestionKind)
  return kinds.some((k) => k === "yes_no") && kinds.some((k) => k !== "yes_no")
}

/**
 * Keeps only the ids in the same group (ladder vs graded) as the first id
 * found in `typeById`, in their original order. Ids not in `typeById` are dropped.
 */
export function trimToFirstKindGroup(ids: string[], typeById: ReadonlyMap<string, string>): string[] {
  const known = ids.filter((id) => typeById.has(id))
  if (known.length === 0) return []
  const isLadder = (id: string) => toQuestionKind(typeById.get(id) as string) === "yes_no"
  const firstIsLadder = isLadder(known[0])
  return known.filter((id) => isLadder(id) === firstIsLadder)
}
