import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { isArchived, type ProfileStatus } from "@/lib/admin/account-status"
import { ROLE } from "@/lib/admin/role-edit"
import {
  parseMembershipAction,
  planMembershipChange,
  type MembershipStatus,
} from "@/lib/admin/department-membership"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ departmentId: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const { departmentId } = await params
  const numericDepartmentId = parseInt(departmentId, 10)
  if (isNaN(numericDepartmentId)) {
    return NextResponse.json({ error: "Invalid department ID" }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const searchQuery = (searchParams.get("q") || "").trim().toLowerCase()

  try {
    const { data: rawMembers, error } = await supabase
      .from("profile_departments")
      .select(`
        profile_id,
        status,
        profile:profiles!profile_departments_profile_id_fkey (
          id,
          given_name,
          last_name,
          email,
          job_title
        )
      `)
      .eq("department_id", numericDepartmentId)

    if (error) {
      throw new Error(`Failed to load department members: ${error.message}`)
    }

    let members = (rawMembers || [])
      .map((row: any) => ({
        id: row.profile?.id || row.profile_id,
        given_name: row.profile?.given_name || null,
        last_name: row.profile?.last_name || null,
        email: row.profile?.email || null,
        job_title: row.profile?.job_title || null,
        roleStatus: row.status || null,
      }))
      .filter((m) => m.id)

    if (searchQuery) {
      members = members.filter((m) => {
        const fullName = `${m.given_name || ""} ${m.last_name || ""}`.toLowerCase()
        const email = (m.email || "").toLowerCase()
        const job = (m.job_title || "").toLowerCase()
        return fullName.includes(searchQuery) || email.includes(searchQuery) || job.includes(searchQuery)
      })
    }

    // Sort alphabetically
    members.sort((a, b) =>
      `${a.given_name || ""} ${a.last_name || ""}`.localeCompare(
        `${b.given_name || ""} ${b.last_name || ""}`
      )
    )

    return NextResponse.json({
      departmentId: numericDepartmentId,
      total: members.length,
      members,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * Make manager / Remove as manager (optionally with a replacement) / Remove
 * from department. Grants the Manager role to anyone promoted who lacks it,
 * and reports who no longer manages any department so the admin can decide
 * about their role.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response

  const { departmentId } = await params
  const numericDepartmentId = parseInt(departmentId, 10)
  if (isNaN(numericDepartmentId)) {
    return NextResponse.json({ error: "Invalid department ID" }, { status: 400 })
  }

  const action = parseMembershipAction(await request.json().catch(() => null))
  if (!action) return NextResponse.json({ error: "Pick at least one person and an action." }, { status: 400 })

  try {
    const supabase = getServiceRoleClient()
    const named = action.action === "demote" && action.replacementId
      ? [...action.profileIds, action.replacementId]
      : action.profileIds

    const [{ data: department, error: deptError }, { data: rows, error: rowsError }, { data: profiles, error: profError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabase.from("departments").select("status").eq("id", numericDepartmentId).maybeSingle(),
        supabase.from("profile_departments").select("profile_id, status").eq("department_id", numericDepartmentId),
        supabase.from("profiles").select("id, status").in("id", named),
        supabase.from("profile_roles").select("profile_id, profile_role").in("profile_id", named),
      ])
    if (deptError) throw new Error(`Failed to load department: ${deptError.message}`)
    if (rowsError) throw new Error(`Failed to load department members: ${rowsError.message}`)
    if (profError) throw new Error(`Failed to load accounts: ${profError.message}`)
    if (rolesError) throw new Error(`Failed to load roles: ${rolesError.message}`)
    if (!department) return NextResponse.json({ error: "This department no longer exists." }, { status: 404 })

    const roleIdsByProfile: Record<string, number[]> = {}
    for (const r of roles ?? []) (roleIdsByProfile[r.profile_id] ??= []).push(r.profile_role as number)

    const result = planMembershipChange({
      request: action,
      departmentClosed: department.status === "closed",
      rows: (rows ?? []).map((r) => ({ profileId: r.profile_id, status: r.status as MembershipStatus })),
      roleIdsByProfile,
      archivedProfileIds: (profiles ?? []).filter((p) => isArchived(p.status as ProfileStatus)).map((p) => p.id),
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    const { plan } = result

    if (plan.grantManagerRole.length > 0) {
      const { error } = await supabase
        .from("profile_roles")
        .insert(plan.grantManagerRole.map((profileId) => ({ profile_id: profileId, profile_role: ROLE.manager })))
      if (error) throw new Error(`Failed to grant the Manager role: ${error.message}`)
    }

    const now = new Date().toISOString()
    if (plan.insert.length > 0) {
      const { error } = await supabase.from("profile_departments").insert(
        plan.insert.map((r) => ({
          department_id: numericDepartmentId,
          profile_id: r.profileId,
          status: r.status,
          added_by: gate.userId,
          added_at: now,
        }))
      )
      if (error) throw new Error(`Failed to update department members: ${error.message}`)
    }
    for (const r of plan.remove) {
      const { error } = await supabase
        .from("profile_departments")
        .delete()
        .match({ department_id: numericDepartmentId, profile_id: r.profileId, status: r.status })
      if (error) throw new Error(`Failed to update department members: ${error.message}`)
    }

    const { error: metaError } = await supabase
      .from("departments")
      .update({ last_updated: now, updated_by: gate.userId })
      .eq("id", numericDepartmentId)
    if (metaError) console.error("Failed to update department metadata:", metaError)

    // Former managers here who now manage nowhere -- they keep the Manager role.
    const formerManagers = plan.remove.filter((r) => r.status === "management").map((r) => r.profileId)
    let noLongerManaging: string[] = []
    if (formerManagers.length > 0) {
      const { data: stillManaging, error } = await supabase
        .from("profile_departments")
        .select("profile_id")
        .eq("status", "management")
        .in("profile_id", formerManagers)
      if (error) throw new Error(`Failed to check remaining departments: ${error.message}`)
      const still = new Set((stillManaging ?? []).map((r) => r.profile_id))
      noLongerManaging = formerManagers.filter((id) => !still.has(id) && (roleIdsByProfile[id] ?? []).includes(ROLE.manager))
    }

    return NextResponse.json({ grantedManagerRole: plan.grantManagerRole, noLongerManaging })
  } catch (err) {
    return toErrorResponse(err)
  }
}
