import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * The people a caller may offer in the "Assign employees to the capability"
 * dialog.
 *
 * This used to be a global query inside manage-profiles-dialog.tsx
 * (profile_roles = 4, every employee in the database). That was harmless
 * while the dialog was only reachable from an admin surface, but the
 * 2026-10-20 manager-assignment design puts the same dialog on a manager
 * surface, where offering an out-of-department employee would mean showing
 * a name the database is about to refuse (can_assign_employee).
 *
 * So the candidate list is now a deliberate choice per surface, made here
 * once rather than in the dialog:
 *   - admin   -> every active employee (unchanged behaviour)
 *   - manager -> only assessment-takers in departments they manage (the
 *                same predicate as load-manager-rows.ts L12-27, so the
 *                list and the team view agree)
 */

export interface AssignmentCandidate {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
}

const CANDIDATE_COLUMNS = "id, given_name, last_name, email"

export function isAssignmentCandidate(p: AssignmentCandidate | undefined | null): p is AssignmentCandidate {
  return Boolean(p)
}

/** Every active (non-archived) account holding the employee role. */
export async function loadAllEmployees(supabase: SupabaseClient): Promise<AssignmentCandidate[]> {
  const { data, error } = await supabase
    .from("profile_roles")
    .select(`profiles!inner(${CANDIDATE_COLUMNS}, status)`)
    .eq("profile_role", 4)
    .neq("profiles.status", "inactive")
  if (error) throw new Error(`Failed to load employees: ${error.message}`)
  return unnestProfiles(data)
}

/**
 * Assessment-takers the manager is allowed to assign: a 'management' row
 * in a department puts them in charge of that department; an 'assessment'
 * row is what makes a person assignable there. Mirrors can_assign_employee
 * in SQL and requireAssigner in require-capability-admin-client.ts.
 */
export async function loadManagerScopedEmployees(
  supabase: SupabaseClient,
  managerId: string
): Promise<AssignmentCandidate[]> {
  const { data: managedRows, error: managedError } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", managerId)
    .eq("status", "management")
  if (managedError) throw new Error(`Failed to load your departments: ${managedError.message}`)
  const departmentIds = (managedRows ?? []).map((r) => r.department_id as number)
  if (departmentIds.length === 0) return []

  // profile_departments has two FKs to profiles (profile_id, added_by), so
  // the embed must name one or PostgREST rejects it as ambiguous -- same
  // reason as load-manager-rows.ts L20-21.
  const { data, error } = await supabase
    .from("profile_departments")
    .select(
      `profiles!profile_departments_profile_id_fkey!inner(${CANDIDATE_COLUMNS}, status)`
    )
    .in("department_id", departmentIds)
    .eq("status", "assessment")
    .neq("profiles.status", "inactive")
  if (error) throw new Error(`Failed to load your employees: ${error.message}`)

  // A person with 'assessment' rows in several managed departments appears
  // once per row, so collapse to one candidate per profile.
  const byId = new Map<string, AssignmentCandidate>()
  for (const p of unnestProfiles(data)) byId.set(p.id, p)
  return Array.from(byId.values())
}

/** PostgREST returns an embedded to-one as an object, but the types allow an array. */
function unnestProfiles(data: unknown[] | null): AssignmentCandidate[] {
  return ((data ?? []) as unknown as { profiles: AssignmentCandidate | AssignmentCandidate[] }[])
    .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
    .filter(isAssignmentCandidate)
}
