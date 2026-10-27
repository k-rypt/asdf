import type { GuardResult } from "./account-status"

/** Pure guard for assigning a capability's owner (null clears it). */
export function checkOwnerAssignment(ownerId: unknown, candidateIds: string[]): GuardResult {
  if (ownerId === null) return { ok: true }
  if (typeof ownerId !== "string") {
    return { ok: false, status: 400, error: "ownerId must be a user id or null." }
  }
  if (!candidateIds.includes(ownerId)) {
    return { ok: false, status: 400, error: "Only an active capability owner can own a capability." }
  }
  return { ok: true }
}
