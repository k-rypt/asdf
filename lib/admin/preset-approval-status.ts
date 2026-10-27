/**
 * Helper to determine a preset's effective approval status.
 *
 * In this application, preset approvals are specifically tied to activating
 * a preset on a capability. If a preset was submitted for approval (pending_approval)
 * but was removed as the active preset (or is no longer set as current_preset),
 * the pending approval disappears and the preset reverts to draft/not approved (null or "draft").
 */

export function resolveEffectivePresetStatus(
  rawStatus: string | null | undefined,
  presetId: number,
  currentPresetId: number | null | undefined
): string | null {
  if (!rawStatus) return null

  // If a preset is marked pending_approval but is not the active preset of the capability,
  // it was removed as active; the pending approval disappears.
  if (rawStatus === "pending_approval") {
    if (currentPresetId == null || currentPresetId !== presetId) {
      return null
    }
  }

  return rawStatus
}

export function isPendingApprovalActive(
  presetId: number,
  currentPresetId: number | null | undefined,
  rawStatus?: string | null
): boolean {
  if (rawStatus && rawStatus !== "pending_approval") {
    return false
  }
  return currentPresetId != null && currentPresetId === presetId
}
