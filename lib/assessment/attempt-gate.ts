import type { SupabaseClient } from "@supabase/supabase-js"

export interface AttemptGateRow {
  id: number
  status: string
  created_at: string
  started_at: string
  completed_at: string | null
}

export type AttemptGate =
  | { kind: "start" }
  | { kind: "resume"; attemptId: number }
  | { kind: "finished"; attemptId: number; status: string; finishedAt: string | null; timeExpired?: true }

/** The assessment's time limit, and the time to judge it against. */
export interface AttemptTimeLimit {
  durationMinutes: number | null
  now: number
}

/** When an attempt's time runs out, or null if the assessment has no limit. */
function deadlineOf(attempt: AttemptGateRow, limit?: AttemptTimeLimit): number | null {
  if (!limit?.durationMinutes) return null
  return new Date(attempt.started_at).getTime() + limit.durationMinutes * 60_000
}

/** In-progress attempts whose time has already run out. */
export function expiredInProgress(attempts: AttemptGateRow[], limit?: AttemptTimeLimit): AttemptGateRow[] {
  return attempts.filter((a) => {
    const deadline = deadlineOf(a, limit)
    return a.status === "in_progress" && deadline !== null && deadline <= limit!.now
  })
}

/**
 * Someone is taking this attempt right now: in progress with time left.
 * An in-progress attempt past its deadline is stale (the page was closed)
 * and is closed on its next load, so it doesn't count.
 */
export function isLiveAttempt(attempt: AttemptGateRow, limit: AttemptTimeLimit): boolean {
  return attempt.status === "in_progress" && expiredInProgress([attempt], limit).length === 0
}

/**
 * One attempt per assessment: an in-progress attempt with time left
 * resumes; otherwise any finished attempt (completed or invalidated) blocks
 * a new one. An in-progress attempt whose time has run out counts as
 * invalidated at its deadline -- resuming it would only close it a second
 * later. Only an admin can allow a retake, by removing the finished
 * attempt. Checks every attempt, not just the latest -- the earliest
 * finished one is reported.
 */
export function attemptGate(attempts: AttemptGateRow[], limit?: AttemptTimeLimit): AttemptGate {
  const expired = new Set(expiredInProgress(attempts, limit).map((a) => a.id))

  const inProgress = attempts.find((a) => a.status === "in_progress" && !expired.has(a.id))
  if (inProgress) return { kind: "resume", attemptId: inProgress.id }

  const finished = attempts
    .filter((a) => a.status === "completed" || a.status === "invalidated" || expired.has(a.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  if (!finished) return { kind: "start" }

  if (expired.has(finished.id)) {
    return {
      kind: "finished",
      attemptId: finished.id,
      status: "invalidated",
      finishedAt: new Date(deadlineOf(finished, limit)!).toISOString(),
      timeExpired: true,
    }
  }
  return { kind: "finished", attemptId: finished.id, status: finished.status, finishedAt: finished.completed_at }
}

export const ATTEMPT_GATE_COLUMNS = "id, status, created_at, started_at, completed_at"

/**
 * Loads this employee's attempts on one assessment and applies attemptGate.
 * Also closes any in-progress attempt whose time has run out, as
 * invalidated at its deadline -- the same outcome the timer would have
 * reached had the page stayed open.
 */
export async function loadAttemptGate(
  supabase: SupabaseClient,
  profileId: string,
  assessmentId: number
): Promise<AttemptGate> {
  const [{ data, error }, { data: assessment, error: assessmentError }] = await Promise.all([
    supabase.from("attempts").select(ATTEMPT_GATE_COLUMNS).eq("assessment_id", assessmentId).eq("profile_id", profileId),
    supabase.from("assessments").select("duration_minutes").eq("id", assessmentId).maybeSingle(),
  ])
  if (error) throw new Error(`Failed to load attempts: ${error.message}`)
  if (assessmentError) throw new Error(`Failed to load assessment: ${assessmentError.message}`)

  const attempts = (data ?? []) as AttemptGateRow[]
  const limit = { durationMinutes: (assessment?.duration_minutes as number | null) ?? null, now: Date.now() }

  for (const stale of expiredInProgress(attempts, limit)) {
    const { error: closeError } = await supabase
      .from("attempts")
      .update({ status: "invalidated", completed_at: new Date(deadlineOf(stale, limit)!).toISOString() })
      .eq("id", stale.id)
      .eq("status", "in_progress")
    if (closeError) throw new Error(`Failed to close expired attempt ${stale.id}: ${closeError.message}`)
    console.warn(`Attempt ${stale.id} invalidated for user ${profileId}: Time expired (found on load).`)
  }

  return attemptGate(attempts, limit)
}
