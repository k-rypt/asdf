import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { computeAssessmentWindow } from "@/lib/assessment/assessment-window"
import { flagOverdueAssessments, type DeadlineCandidate } from "@/lib/assessment/deadline-flags"
import { achievedTierFromTierResult } from "@assessment-toolkit/core/server"
import type { TierResult } from "@assessment-toolkit/core"
import { type ManagerRow } from "@/components/protected/manager/manager-dashboard-client"
import { ATTEMPT_GATE_COLUMNS, attemptGate, isLiveAttempt, type AttemptGateRow } from "@/lib/assessment/attempt-gate"
import { rowStatusFor } from "@/lib/assessment/row-status"
import { currentProficiency, type ProficiencyAttempt } from "@/lib/assessment/proficiency"

export interface CapabilityAssignmentRow {
  profile_id: string
  capability_id: number
  added_at: string
  capabilities: { name: string } | { name: string }[] | null
}

export interface ProfileRow {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
}

/**
 * Builds the manager-dashboard row set from a capability-assignment join
 * that's already been filtered down to the profiles this caller is allowed
 * to see (department-scoped for the manager dashboard, capability-scoped
 * for the capability-owner employees page) -- this function itself applies
 * no additional scoping, it only turns assignments into display rows.
 */
export async function buildManagerRows(
  supabase: SupabaseClient,
  capabilityAssignments: CapabilityAssignmentRow[],
  profileById: Map<string, ProfileRow>,
  options?: { skipFlagging?: boolean }
): Promise<ManagerRow[]> {
  const capabilityIds = Array.from(
    new Set((capabilityAssignments ?? []).map((a) => a.capability_id))
  )

  const { data: publishedAssessments } = capabilityIds.length
    ? await supabase
        .from("assessments")
        .select("id, capability_id, available_from, available_until, duration_minutes")
        .in("capability_id", capabilityIds)
        .eq("status", "published")
    : {
        data: [] as {
          id: number
          capability_id: number
          available_from: string | null
          available_until: string | null
          duration_minutes: number | null
        }[],
      }

  const assessmentByCapability = new Map(
    (publishedAssessments ?? []).map((a) => [a.capability_id as number, a])
  )

  const reportIds = Array.from(profileById.keys())

  // Someone mid-attempt on a version that's since been replaced by a newer
  // publish finishes on the old one (see resolvable-assessments.ts), so
  // their row tracks that version until the attempt ends.
  const { data: replacedInProgress } = capabilityIds.length
    ? await supabase
        .from("attempts")
        .select(
          `${ATTEMPT_GATE_COLUMNS}, profile_id, assessments!inner(id, capability_id, available_from, available_until, duration_minutes, status)`
        )
        .in("profile_id", reportIds)
        .eq("status", "in_progress")
        .in("assessments.capability_id", capabilityIds)
        .neq("assessments.status", "published")
    : { data: [] }
  const replacedNow = Date.now()
  const replacedByPair = new Map<string, NonNullable<typeof publishedAssessments>[number]>()
  for (const row of (replacedInProgress ?? []) as unknown as (AttemptGateRow & {
    profile_id: string
    assessments: NonNullable<typeof publishedAssessments>[number]
  })[]) {
    const assessment = row.assessments
    if (!isLiveAttempt(row, { durationMinutes: assessment.duration_minutes ?? null, now: replacedNow })) continue
    replacedByPair.set(`${assessment.capability_id}:${row.profile_id}`, assessment)
  }

  const assessmentIds = Array.from(
    new Set([
      ...(publishedAssessments ?? []).map((a) => a.id as number),
      ...Array.from(replacedByPair.values()).map((a) => a.id as number),
    ])
  )

  const { data: attempts } = assessmentIds.length
    ? await supabase
        .from("attempts")
        .select("id, assessment_id, profile_id, status, tier_result, created_at, started_at, completed_at")
        .in("assessment_id", assessmentIds)
        .in("profile_id", reportIds)
    : {
        data: [] as (AttemptGateRow & { assessment_id: number; profile_id: string; tier_result: unknown })[],
      }

  const candidates: DeadlineCandidate[] = []
  for (const assignment of capabilityAssignments ?? []) {
    const assessment = assessmentByCapability.get(assignment.capability_id as number)
    if (!assessment) continue
    candidates.push({
      assessmentId: assessment.id as number,
      profileId: assignment.profile_id as string,
      capabilityId: assignment.capability_id as number,
      availableFrom: assessment.available_from as string | null,
      availableUntil: assessment.available_until as string | null,
      addedAt: assignment.added_at as string,
    })
  }
  // The employee Assessments page passes skipFlagging: true -- an
  // employee's own RLS grant doesn't include insert on
  // assessment_deadline_flags (admin/capability-owner/manager only), so
  // calling this unconditionally logged a denied-upsert error on every
  // load. The Missed bucket still computes correctly without it, via the
  // window.state === "expired" fallback below. Final-review finding.
  if (!options?.skipFlagging) {
    await flagOverdueAssessments(supabase, candidates)
  }

  const { data: flaggedRows } = assessmentIds.length
    ? await supabase
        .from("assessment_deadline_flags")
        .select("assessment_id, profile_id")
        .in("assessment_id", assessmentIds)
        .in("profile_id", reportIds)
    : { data: [] as { assessment_id: number; profile_id: string }[] }
  const overdueKeys = new Set((flaggedRows ?? []).map((f) => `${f.assessment_id}:${f.profile_id}`))

  // Every attempt per pair -- an employee can have more than one (e.g. a
  // resumed run after an older closed one), and attemptGate decides which
  // one the row reflects, the same way the take page does.
  const attemptsByKey = new Map<string, NonNullable<typeof attempts>>()
  for (const a of attempts ?? []) {
    const key = `${a.assessment_id}:${a.profile_id}`
    attemptsByKey.set(key, [...(attemptsByKey.get(key) ?? []), a])
  }
  const now = Date.now()

  // Proficiency: every finished ladder attempt for these people on these
  // capabilities, whichever assessment it was -- not just the current one.
  const { data: ladderAttempts, error: ladderAttemptsError } = capabilityIds.length && reportIds.length
    ? await supabase
        .from("attempts")
        .select("id, profile_id, status, completed_at, tier_result, assessments!inner(name, capability_id)")
        .in("profile_id", reportIds)
        .in("assessments.capability_id", capabilityIds)
        .eq("status", "completed")
        .not("tier_result", "is", null)
        .order("completed_at", { ascending: false })
    : { data: [], error: null }
  // Don't fail the whole dashboard over proficiency -- rows just show no ladder level.
  if (ladderAttemptsError) {
    console.error("buildManagerRows: failed to load ladder attempts:", ladderAttemptsError.message)
  }
  const ladderByPair = new Map<string, ProficiencyAttempt[]>()
  for (const a of (ladderAttempts ?? []) as unknown as {
    id: number
    profile_id: string
    status: string
    completed_at: string | null
    tier_result: unknown
    assessments: { name: string; capability_id: number } | { name: string; capability_id: number }[]
  }[]) {
    const assessment = Array.isArray(a.assessments) ? a.assessments[0] : a.assessments
    const key = `${assessment.capability_id}:${a.profile_id}`
    ladderByPair.set(key, [
      ...(ladderByPair.get(key) ?? []),
      { id: a.id, status: a.status, completed_at: a.completed_at, tier_result: a.tier_result, assessment_name: assessment.name },
    ])
  }

  const rows: ManagerRow[] = (capabilityAssignments ?? []).map((assignment) => {
    const profile = profileById.get(assignment.profile_id)
    const capabilityName = Array.isArray(assignment.capabilities)
      ? assignment.capabilities[0]?.name
      : assignment.capabilities?.name
    const assessment =
      replacedByPair.get(`${assignment.capability_id}:${assignment.profile_id}`) ??
      assessmentByCapability.get(assignment.capability_id)

    let status: ManagerRow["assessmentStatus"] = "not_yet_open"
    let deadline: string | null = null
    let achievedTier: ManagerRow["achievedTier"] = null
    let completedAt: string | null = null
    let attemptId: number | null = null

    if (assessment) {
      deadline = assessment.available_until as string | null
      const key = `${assessment.id}:${assignment.profile_id}`
      const pairAttempts = attemptsByKey.get(key) ?? []
      const gate = attemptGate(pairAttempts as AttemptGateRow[], {
        durationMinutes: (assessment.duration_minutes as number | null) ?? null,
        now,
      })
      if (gate.kind !== "start") attemptId = gate.attemptId
      if (gate.kind === "finished") {
        const attempt = pairAttempts.find((a) => a.id === gate.attemptId)
        achievedTier = achievedTierFromTierResult((attempt?.tier_result ?? null) as TierResult | null)
        completedAt = gate.finishedAt
      }
      // The expired-window fallback covers pairs not yet flagged in
      // assessment_deadline_flags (e.g. skipFlagging on the employee page).
      const window = computeAssessmentWindow({
        availableFrom: assessment.available_from,
        availableUntil: assessment.available_until,
        addedAt: assignment.added_at,
      })
      status = rowStatusFor(gate, { overdue: overdueKeys.has(key), windowState: window.state })
    }

    const proficiency = currentProficiency(ladderByPair.get(`${assignment.capability_id}:${assignment.profile_id}`) ?? [])

    return {
      profileId: assignment.profile_id,
      givenName: profile?.given_name ?? "",
      lastName: profile?.last_name ?? "",
      email: profile?.email ?? "",
      capabilityId: assignment.capability_id,
      capabilityName: capabilityName ?? "Unknown",
      assessmentId: assessment ? (assessment.id as number) : null,
      assessmentStatus: status,
      deadline,
      achievedTier,
      currentLevel: proficiency.current,
      levelHistory: proficiency.history,
      completedAt,
      attemptId,
    }
  })

  return rows
}
