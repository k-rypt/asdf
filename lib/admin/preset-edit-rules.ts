/**
 * Rules for changing a preset, shared by the preset routes and the UI.
 *
 * Approval belongs to the active preset only: setting a preset active sends
 * it for review, and only the active preset can be (re)submitted. Draft,
 * rejected and pending presets stay editable; editing a pending one withdraws
 * its request so the admin never approves something other than what they see.
 * Any preset except the active one can be deleted.
 *
 * `status` is preset_current_status.status (null when it has no history).
 */

export function editPresetBlockedReason(status: string | null | undefined): string | null {
  return status === "approved"
    ? "This preset is approved, so its questions are locked."
    : null
}

export function withdrawsOnEdit(status: string | null | undefined): boolean {
  return status === "pending_approval"
}

export function deletePresetBlockedReason(
  presetId: number,
  currentPresetId: number | null | undefined
): string | null {
  return currentPresetId === presetId
    ? "This is the active preset. Change or remove it first, then delete it."
    : null
}

export function submitPresetBlockedReason(
  status: string | null | undefined,
  presetId: number,
  currentPresetId: number | null | undefined
): string | null {
  if (currentPresetId !== presetId) {
    return "Only the active preset can be sent for approval. Set it as active first."
  }
  if (status === "pending_approval" || status === "approved") {
    return "This preset is already pending approval or has already been approved."
  }
  return null
}
