import type { HeartbeatResult } from "@assessment-toolkit/core"

/**
 * What a heartbeat tells the client, given the attempt's current row.
 * A `completed` attempt is not expired: completeSession marks the attempt
 * completed before it finishes calibrating, and a heartbeat landing in that
 * gap used to report "expired", which made the client invalidate a
 * finished attempt.
 */
export function heartbeatOutcome(
  attempt: { status: string; startedAt: string; durationMinutes: number | null } | null,
  now: number
): HeartbeatResult {
  if (attempt?.status === "completed") return { success: true }
  if (!attempt || attempt.status !== "in_progress") return { success: false, expired: true }
  if (!attempt.durationMinutes) return { success: true }

  const elapsedSeconds = Math.floor((now - new Date(attempt.startedAt).getTime()) / 1000)
  const timeLeft = attempt.durationMinutes * 60 - elapsedSeconds
  return { success: timeLeft > 0, expired: timeLeft <= 0, timeLeft: Math.max(timeLeft, 0) }
}
