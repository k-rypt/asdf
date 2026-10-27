import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Keeping `capabilities.owner_id` and the owner's `profile_capabilities`
 * row in step.
 *
 * These are two separate records of the same fact, and until now only one
 * of the two admin paths maintained both:
 *
 *   - the invite route (app/api/admin/users/invite/route.ts) writes
 *     owner_id AND a profile_capabilities row with
 *     assignment_type = 'management'
 *   - the Assign Owner dialog's route (app/api/admin/capabilities/
 *     [capability]/owner) wrote only owner_id
 *
 * So an owner set from the capability page had no 'management' row, and an
 * owner cleared from there left a stale one behind. The two surfaces then
 * disagreed about who owned what -- the "Capability Owner" card reads
 * owner_id, while an owner's access (can_manage_capability) needs owner_id
 * AND the role, and the assigned-profiles list reads the row.
 *
 * The invariant this file enforces, for a single (profile, capability)
 * pair:
 *
 *   capabilities.owner_id = P  =>  profile_capabilities has a row for
 *                                  (P, C) that is 'management' *unless* it
 *                                  is already 'assessment'
 *
 * The 'assessment' exception is deliberate and matches the invite route
 * (app/api/admin/users/invite/route.ts L164-176): the PK is
 * (profile_id, capability_id), so a person holds at most ONE row per
 * capability. Someone who is both an employee and the owner keeps the
 * 'assessment' row -- they are a test-taker first, and the row still marks
 * them as attached to the capability. Overwriting it would silently delete
 * an assessment assignment.
 */

/** The row shape both paths write. */
export interface AssignmentRow {
  profile_id: string
  capability_id: number
  assignment_type: string
  added_at: string
}

/**
 * Brings the 'management' row for (profileId, capabilityId) in line with
 * ownership. Call after updating capabilities.owner_id, with the NEW owner
 * (or null when clearing).
 *
 * `previousOwnerId` exists because switching A -> B must also drop A's
 * row. Without it, A keeps a 'management' row forever and stays in the
 * capability's assigned list even though they no longer own anything --
 * the exact stale-row drift this file was written to stop.
 *
 * Returns an error message on failure; the caller decides whether that is
 * fatal. This never throws, so a partial failure is always reportable.
 */
export async function syncOwnerAssignment(
  supabase: SupabaseClient,
  capabilityId: number,
  ownerId: string | null,
  previousOwnerId: string | null = null
): Promise<{ error?: string }> {
  // Clearing an owner: drop the capability's 'management' rows. There can
  // be several (a capability may have had more than one owner over time,
  // and the old row is not tied to the old owner_id), so this is a bulk
  // delete rather than one keyed on the previous owner's id.
  //
  // Only 'management' rows are removed: an 'assessment' row is an
  // employee assignment and has nothing to do with ownership.
  if (ownerId === null) {
    const { error } = await supabase
      .from("profile_capabilities")
      .delete()
      .eq("capability_id", capabilityId)
      .eq("assignment_type", "management")
    if (error) return { error: `Could not clear the previous owner's assignment: ${error.message}` }
    return {}
  }

  // Switching owners: remove the outgoing owner's 'management' row. Scoped
  // to that profile and that capability, so it cannot touch anyone else,
  // and to 'management' so an employee assignment survives.
  if (previousOwnerId && previousOwnerId !== ownerId) {
    const { error: removeError } = await supabase
      .from("profile_capabilities")
      .delete()
      .eq("capability_id", capabilityId)
      .eq("profile_id", previousOwnerId)
      .eq("assignment_type", "management")
    if (removeError) {
      return { error: `Could not remove the previous owner's assignment: ${removeError.message}` }
    }
  }

  // Existing row for this person/capability, whatever its type -- the PK
  // allows only one.
  const { data: existing, error: readError } = await supabase
    .from("profile_capabilities")
    .select("assignment_type")
    .eq("profile_id", ownerId)
    .eq("capability_id", capabilityId)
    .maybeSingle()
  if (readError) return { error: `Could not check existing assignments: ${readError.message}` }

  // Already attached as an employee: leave it alone (see the header note).
  if (existing) return {}

  const { error: insertError } = await supabase
    .from("profile_capabilities")
    .insert({
      profile_id: ownerId,
      capability_id: capabilityId,
      assignment_type: "management",
      added_at: new Date().toISOString(),
    })
  if (insertError) return { error: `Capability owner set, but their assignment was not recorded: ${insertError.message}` }

  return {}
}
