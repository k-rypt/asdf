/**
 * Pure archive/reactivate guards -- no I/O, so they're unit-testable.
 * The admin user routes gather these inputs and call them. "Archived"
 * is profiles.status = 'inactive'; 'pending' is a live account (nothing
 * in the app promotes pending -> active), so it is never treated as
 * archived.
 */

export type ProfileStatus = "pending" | "active" | "inactive"

export type GuardResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string }

export interface ArchiveCheckInput {
  callerId: string
  targetId: string
  /** null = profile not found */
  targetStatus: ProfileStatus | null
  targetIsAdmin: boolean
  /** Admins whose status <> 'inactive', including the target. */
  nonInactiveAdminCount: number
  /** Assessments the target is taking right now (live in-progress attempts). */
  liveAssessmentNames: string[]
}

export function isArchived(status: ProfileStatus | null | undefined): boolean {
  return status === "inactive"
}

export function checkArchiveAllowed(input: ArchiveCheckInput): GuardResult {
  if (input.targetId === input.callerId) {
    return { ok: false, status: 400, error: "You can't archive your own account." }
  }
  if (input.targetStatus === null) {
    return { ok: false, status: 404, error: "User not found." }
  }
  if (isArchived(input.targetStatus)) {
    return { ok: false, status: 409, error: "This account is already archived." }
  }
  // Archiving signs them out and would close the attempt as invalidated,
  // which under one-attempt-per-assessment costs them the assessment.
  if (input.liveAssessmentNames.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `They're taking ${input.liveAssessmentNames.join(", ")} right now. You can archive the account once they finish.`,
    }
  }
  if (input.targetIsAdmin && input.nonInactiveAdminCount <= 1) {
    return { ok: false, status: 409, error: "You can't archive the last active admin." }
  }
  return { ok: true }
}

export function checkReactivateAllowed(targetStatus: ProfileStatus | null): GuardResult {
  if (targetStatus === null) {
    return { ok: false, status: 404, error: "User not found." }
  }
  if (!isArchived(targetStatus)) {
    return { ok: false, status: 409, error: "This account isn't archived." }
  }
  return { ok: true }
}
