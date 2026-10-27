export type NotificationLinkType =
  | "upcoming"
  | "active_started"
  | "active_midpoint"
  | "active_due_soon"
  | "attempt_completed"
  | "preset_approved"
  | "preset_rejected"

export interface NotificationLinkRow {
  type: NotificationLinkType
  assessment_id: number | null
  attempt_id: number | null
  completer_profile_id: string | null
  capability_id?: number | null
}

/**
 * attempt_completed goes to managers and the capability owner alike, who
 * review from different areas -- /protected/review-attempt/[attemptId]
 * works out which page this reader can open and redirects there.
 */
export function linkForNotification(row: NotificationLinkRow): string | null {
  if (row.type === "attempt_completed") {
    return row.attempt_id != null ? `/protected/review-attempt/${row.attempt_id}` : null
  }
  if (row.type === "preset_approved" || row.type === "preset_rejected") {
    return row.capability_id != null ? `/protected/capability/${row.capability_id}?tab=presets` : null
  }
  return row.assessment_id != null ? `/protected/employee/assessment/${row.assessment_id}` : null
}
