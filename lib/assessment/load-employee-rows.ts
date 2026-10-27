import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildManagerRows, type CapabilityAssignmentRow, type ProfileRow } from "@/lib/assessment/build-manager-rows"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

/**
 * Reuses buildManagerRows -- the exact same join the Manager and
 * Capability-Owner dashboards already use -- scoped down to just this
 * employee's own profile_capabilities rows, instead of a department's or
 * capability's whole membership. Not a new status computation. Shared by
 * the employee Overview and My Assessments pages.
 */
export async function loadEmployeeRows(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ profile: ProfileRow | null; rows: ManagerRow[]; asOf: number }> {
  // The time the rows were judged at, so the caller renders deadlines
  // against the same clock rather than reading its own during render.
  const asOf = Date.now()
  const [{ data: assignments }, { data: profile }] = await Promise.all([
    supabase
      .from("profile_capabilities")
      .select("profile_id, capability_id, added_at, capabilities(name)")
      .eq("profile_id", profileId),
    supabase.from("profiles").select("id, given_name, last_name, email").eq("id", profileId).maybeSingle(),
  ])

  const profileById = new Map<string, ProfileRow>(profile ? [[profile.id, profile]] : [])

  const rows = await buildManagerRows(
    supabase,
    (assignments ?? []) as unknown as CapabilityAssignmentRow[],
    profileById,
    // Employees have no insert grant on assessment_deadline_flags --
    // skip the write entirely rather than let it fail RLS on every load.
    { skipFlagging: true }
  )

  return { profile: (profile as ProfileRow | null) ?? null, rows, asOf }
}
