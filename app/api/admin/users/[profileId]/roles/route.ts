import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { isArchived } from "@/lib/admin/account-status"
import { loadArchiveContext, loadInProgressAttempts } from "@/lib/admin/account-deps"
import { checkRoleEditAllowed } from "@/lib/admin/role-edit"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ profileId: string }>
}

async function loadRoleIds(profileId: string): Promise<number[]> {
  const { data, error } = await getServiceRoleClient()
    .from("profile_roles")
    .select("profile_role")
    .eq("profile_id", profileId)
  if (error) throw new Error(`Failed to load roles: ${error.message}`)
  return (data ?? []).map((r) => r.profile_role as number)
}

/** For the Edit roles dialog: current roles, and whether the manager/owner roles are set up elsewhere. */
export async function GET(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  try {
    const supabase = getServiceRoleClient()
    const [roleIds, { count: managedCount }, { count: ownedCount }] = await Promise.all([
      loadRoleIds(profileId),
      supabase
        .from("profile_departments")
        .select("department_id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("status", "management"),
      supabase.from("capabilities").select("id", { count: "exact", head: true }).eq("owner_id", profileId),
    ])
    return NextResponse.json({
      roleIds,
      managesDepartment: (managedCount ?? 0) > 0,
      ownsCapability: (ownedCount ?? 0) > 0,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * Replaces the person's role list. Adds the new roles before removing the
 * old ones, so a failure part-way never leaves them with no role at all.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  const body = (await request.json().catch(() => null)) as { roleIds?: unknown } | null
  const nextRoleIds = Array.isArray(body?.roleIds)
    ? Array.from(new Set(body.roleIds.filter((id): id is number => Number.isInteger(id))))
    : null
  if (!nextRoleIds) return NextResponse.json({ error: "roleIds must be a list of role ids." }, { status: 400 })

  try {
    const [context, currentRoleIds, live] = await Promise.all([
      loadArchiveContext(profileId),
      loadRoleIds(profileId),
      loadInProgressAttempts(profileId),
    ])
    const guard = checkRoleEditAllowed({
      callerId: gate.userId,
      targetId: profileId,
      targetExists: context.targetStatus !== null,
      targetArchived: isArchived(context.targetStatus),
      currentRoleIds,
      nextRoleIds,
      nonInactiveAdminCount: context.nonInactiveAdminCount,
      liveAssessmentNames: live.map((a) => a.assessmentName),
    })
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const supabase = getServiceRoleClient()
    const toAdd = nextRoleIds.filter((id) => !currentRoleIds.includes(id))
    const toRemove = currentRoleIds.filter((id) => !nextRoleIds.includes(id))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from("profile_roles")
        .insert(toAdd.map((roleId) => ({ profile_id: profileId, profile_role: roleId })))
      if (error) throw new Error(`Failed to add roles: ${error.message}`)
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("profile_roles")
        .delete()
        .eq("profile_id", profileId)
        .in("profile_role", toRemove)
      if (error) throw new Error(`Failed to remove roles: ${error.message}`)
    }

    return NextResponse.json({ roleIds: nextRoleIds })
  } catch (err) {
    return toErrorResponse(err)
  }
}
