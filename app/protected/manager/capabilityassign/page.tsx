import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { loadManagerScopedEmployees } from "@/lib/admin/assignment-candidates"
import { ManagerAssignCapabilityClient } from "@/components/protected/manager/manager-assign-capability-client"

/**
 * Manager surface for assigning employees to capabilities. Assignment is a
 * manager function (2026-10-20 manager-assignment design, D4), and this is
 * the page that exposes it -- the capability detail view is shared with
 * owners and therefore only shows the controls to admins.
 *
 * Scope: the manager may assign to ANY capability (D2 -- "it is assumed
 * every employee may have different capabilities"), but only the people in
 * departments they manage, which is what loadManagerScopedEmployees
 * returns. The database enforces both halves independently
 * (can_assign_employee); this page just avoids offering what would be
 * refused.
 */
export default async function ManagerAssignCapabilityPage() {
  const user = await getUser()
  if (!user) {
    // layout.tsx already redirects unauthenticated/non-manager users
    // before this renders -- this is just a type-narrowing guard.
    return null
  }

  const supabase = createClient(await cookies())

  const [candidates, { data: capabilities }] = await Promise.all([
    loadManagerScopedEmployees(supabase, user.id),
    supabase.from("capabilities").select("id, name, status").order("name"),
  ])

  // Current assignments for every capability, so the dialog opens with the
  // right people already in it. Scoped to the manager's own employees: the
  // dialog only ever shows or changes those, so fetching the rest would be
  // handing the browser rows it has no business rendering.
  const candidateIds = candidates.map((c) => c.id)
  const { data: assignments } =
    candidateIds.length > 0
      ? await supabase
          .from("profile_capabilities")
          .select("capability_id, profile_id, assignment_type")
          .in("profile_id", candidateIds)
          .neq("assignment_type", "management")
      : { data: [] }

  return (
    <ManagerAssignCapabilityClient
      capabilities={(capabilities ?? []).map((c) => ({
        id: String(c.id),
        name: c.name as string,
        status: c.status as string | null,
      }))}
      candidates={candidates}
      assignments={(assignments ?? []).map((a) => ({
        capabilityId: String(a.capability_id),
        profileId: a.profile_id as string,
      }))}
    />
  )
}
