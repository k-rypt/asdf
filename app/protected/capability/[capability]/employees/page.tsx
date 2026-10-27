import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { buildManagerRows, type CapabilityAssignmentRow, type ProfileRow } from "@/lib/assessment/build-manager-rows"
import { ManagerDashboardClient } from "@/components/protected/manager/manager-dashboard-client"

interface PageProps {
  params: Promise<{ capability: string }>
}

/**
 * Capability-scoped counterpart to app/protected/manager/page.tsx --
 * CapabilityLayout already gates this whole subtree to capability owners
 * (role id 3), so no additional auth check is needed here. Reuses
 * buildManagerRows/ManagerDashboardClient rather than duplicating the
 * status/tier computation a second time.
 */
export default async function CapabilityEmployeesPage({ params }: PageProps) {
  const { capability: capabilityIdParam } = await params
  const capabilityId = Number(capabilityIdParam)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // For the heading and back link -- previously this page reused the
  // manager dashboard's "Your Team" heading verbatim, so it gave no clue
  // which capability you were looking at and no way back to it.
  const { data: capability } = await supabase
    .from("capabilities")
    .select("name")
    .eq("id", capabilityId)
    .maybeSingle()

  // Mirrors the assignment_type filter and selected columns on
  // manager/page.tsx's capabilityAssignments query -- buildManagerRows
  // needs added_at (for the per-employee availability window) and the
  // joined capability name, not just assignment_type.
  const { data: assignments } = await supabase
    .from("profile_capabilities")
    .select("profile_id, capability_id, added_at, capabilities(name)")
    .eq("capability_id", capabilityId)
    .neq("assignment_type", "management")

  const profileIds = Array.from(new Set((assignments ?? []).map((a) => a.profile_id as string)))
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, given_name, last_name, email")
    .in("id", profileIds.length > 0 ? profileIds : ["00000000-0000-0000-0000-000000000000"])

  const profileById = new Map<string, ProfileRow>((profiles ?? []).map((p) => [p.id, p]))

  const rows = await buildManagerRows(
    supabase,
    (assignments ?? []) as unknown as CapabilityAssignmentRow[],
    profileById
  )

  return (
    <ManagerDashboardClient
      rows={rows}
      detailHrefBase={`/protected/capability/${capabilityId}/assessments`}
      detailHrefSuffix="attempt-review"
      backHref={`/protected/capability/${capabilityId}`}
      backLabel={capability?.name ? `Back to ${capability.name}` : "Back to capability"}
      title={capability?.name ? `Employee progress — ${capability.name}` : "Employee progress"}
      subtitle="Assessment progress for each employee assigned to this capability."
    />
  )
}
