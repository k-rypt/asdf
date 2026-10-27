/**
 * Archive/reactivate orchestration. I/O is injected (see account-deps.ts
 * for the real Supabase-backed implementation) so the ordering and
 * rollback rules are unit-testable.
 *
 * Archive order is ban -> close in-progress attempts -> set inactive. The
 * ban goes first so a failure leaves the account untouched; if anything
 * after it fails, the ban is lifted again (best-effort) so the account is
 * never left half-archived.
 */

export interface AccountDeps {
  ban(profileId: string): Promise<void>
  unban(profileId: string): Promise<void>
  /** Marks every in_progress attempt invalidated; returns the closed attempt ids. */
  closeInProgressAttempts(profileId: string): Promise<number[]>
  setStatus(profileId: string, status: "active" | "inactive"): Promise<void>
}

export async function archiveAccount(deps: AccountDeps, profileId: string): Promise<{ closedAttemptIds: number[] }> {
  await deps.ban(profileId)
  try {
    const closedAttemptIds = await deps.closeInProgressAttempts(profileId)
    await deps.setStatus(profileId, "inactive")
    return { closedAttemptIds }
  } catch (err) {
    try {
      await deps.unban(profileId)
    } catch (unbanErr) {
      console.error(`archiveAccount: failed to lift ban for ${profileId} after error:`, unbanErr)
    }
    throw err
  }
}

/** Attempts invalidated by the archive stay invalidated -- reactivation never touches them. */
export async function reactivateAccount(deps: AccountDeps, profileId: string): Promise<void> {
  await deps.unban(profileId)
  await deps.setStatus(profileId, "active")
}
