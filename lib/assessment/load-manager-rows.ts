import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildManagerRows, type CapabilityAssignmentRow, type ProfileRow } from "@/lib/assessment/build-manager-rows"
import type { ManagerRow } from "@/components/protected/manager/manager-dashboard-client"

/**
 * The manager's team rows: every non-archived assessment-taker in the
 * departments this manager manages, one row per capability assignment.
 * Shared by the manager Overview and Stats pages.
 */
export async function loadManagerRows(supabase: SupabaseClient, managerId: string): Promise<ManagerRow[]> {
  const { data: managedDepartmentRows } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", managerId)
    .eq("status", "management")
  const departmentIds = (managedDepartmentRows ?? []).map((r) => r.department_id as number)
  if (departmentIds.length === 0) return []

  // profile_departments has two FKs to profiles (profile_id, added_by), so
  // the embed must name which one or PostgREST rejects it as ambiguous.
  const { data: reportRows } = await supabase
    .from("profile_departments")
    .select("profile_id, profiles!profile_departments_profile_id_fkey!inner(id, given_name, last_name, email, status)")
    .in("department_id", departmentIds)
    .eq("status", "assessment")
    .neq("profiles.status", "inactive")

  const reportProfiles = (reportRows ?? [])
    .map((r) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as ProfileRow | undefined)
    .filter((p): p is ProfileRow => Boolean(p))
  const profileById = new Map(reportProfiles.map((p) => [p.id, p]))
  if (profileById.size === 0) return []

  // assignment_type is 'assessment' (invite flow), 'assigned' (Manage
  // Profiles dialog), or 'management' (capability owner, not a
  // test-taker) -- exclude only the latter. Both employee call sites
  // (requireEmployeeAssessmentClient, employee/assessment/page.tsx)
  // apply no assignment_type filter at all, so an 'assigned' profile is
  // just as subject to the availability window as an 'assessment' one;
  // filtering this query down to 'assessment' only (as originally
  // planned) silently hid Manage-Profiles-assigned employees from their
  // manager -- final-review finding, fixed here.
  const { data: capabilityAssignments } = await supabase
    .from("profile_capabilities")
    .select("profile_id, capability_id, added_at, capabilities(name)")
    .in("profile_id", Array.from(profileById.keys()))
    .neq("assignment_type", "management")

  return buildManagerRows(supabase, (capabilityAssignments ?? []) as unknown as CapabilityAssignmentRow[], profileById)
}
