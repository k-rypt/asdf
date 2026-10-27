import "server-only"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createClient } from "@/supabase/server"
import { canAssignEmployee, canManageCapability, NOT_YOUR_CAPABILITY, NOT_YOUR_EMPLOYEE } from "@/lib/admin/capability-access"

/**
 * Shared auth step for admin-facing question/assessment-authoring routes
 * (currently just app/api/admin/capabilities/[capability]/generate-assessment).
 *
 * Mirrors requireEmployeeAssessmentClient's shape (identity from the
 * session cookie, never a client-supplied id), but gates on 'admin' or
 * 'capability owner' instead of 'employee' -- the same role check the
 * questions/assessment_questions/assessment_tiers RLS policies already
 * enforce (see supabase/migrations/2026-09-21_assessment_toolkit_schema.sql).
 * This only checks the role, not which capability. Routes that change a
 * specific capability's data must use requireCapabilityManager (below),
 * which limits capability owners to the capability they own, matching the
 * database's can_manage_capability() policies. Returns a plain
 * (RLS-respecting) client, not a service-role one, so every insert this
 * route makes is still subject to those same policies.
 *
 * `roleNames` is returned alongside the client so a caller that needs a
 * narrower gate than "admin or capability owner" (e.g. the publish route,
 * which is admin-only) can check it without a second profile_roles query.
 */

interface SuccessResult {
  ok: true
  user: User
  supabase: SupabaseClient
  roleNames: string[]
}

interface FailureResult {
  ok: false
  response: NextResponse
}

export async function requireCapabilityAdminClient(): Promise<SuccessResult | FailureResult> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) }
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", user.id)
  if (roleError) {
    return { ok: false, response: NextResponse.json({ error: roleError.message }, { status: 500 }) }
  }
  const roleNames = (roleRows ?? [])
    .map((row) => (row.roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name))
  if (!roleNames.includes("admin") && !roleNames.includes("capability owner")) {
    return { ok: false, response: NextResponse.json({ error: "Not authorized." }, { status: 403 }) }
  }

  return { ok: true, user, supabase, roleNames }
}

/** What a route acts on; resolved to its capability before the check. */
export type CapabilityTarget =
  | { capabilityId: string | number }
  | { assessmentId: string | number }
  | { questionId: string }
  | { presetId: string | number }

async function resolveCapabilityId(supabase: SupabaseClient, target: CapabilityTarget): Promise<number | null> {
  if ("capabilityId" in target) {
    const id = Number(target.capabilityId)
    return Number.isFinite(id) ? id : null
  }
  const [table, id] =
    "assessmentId" in target
      ? ["assessments", target.assessmentId]
      : "presetId" in target
        ? ["question_presets", target.presetId]
        : ["questions", target.questionId]
  // A malformed id makes Postgres reject the filter; that's "not found" too.
  const { data } = await supabase.from(table).select("capability_id").eq("id", id).maybeSingle()
  return (data?.capability_id as number | null | undefined) ?? null
}

/**
 * requireCapabilityAdminClient narrowed to one capability: admins pass,
 * a capability owner passes only for the capability they own. The database
 * enforces the same rule (can_manage_capability); this gives routes a clear
 * 403 before they touch it.
 */
export async function requireCapabilityManager(target: CapabilityTarget): Promise<SuccessResult | FailureResult> {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx

  const capabilityId = await resolveCapabilityId(ctx.supabase, target)
  if (capabilityId === null) {
    return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) }
  }

  const { data: capability, error } = await ctx.supabase
    .from("capabilities")
    .select("owner_id")
    .eq("id", capabilityId)
    .maybeSingle()
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!capability) {
    return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) }
  }

  const allowed = canManageCapability({
    roleNames: ctx.roleNames,
    userId: ctx.user.id,
    ownerId: (capability.owner_id as string | null) ?? null,
  })
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: NOT_YOUR_CAPABILITY }, { status: 403 }) }
  }
  return ctx
}

/**
 * Gate for routes that assign (or un-assign) an employee to a capability:
 * admins pass, and a manager passes only when the target is an
 * assessment-taker in a department they manage.
 *
 * This deliberately does NOT build on requireCapabilityAdminClient: that
 * function admits only admins and capability owners, which would refuse every
 * manager before the real check ran. It repeats the identity step instead and
 * gates on its own role set, so widening it can never leak into the
 * capability-authoring routes.
 *
 * There is no capability-owner branch on purpose: assigning employees to a
 * capability is a manager function, not an owner function (see
 * docs/superpowers/specs/2026-10-20-manager-assignment-design.md, D4/D6).
 * The capability is not consulted, so this takes a profile id only.
 */
export async function requireAssigner(profileId: string): Promise<SuccessResult | FailureResult> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) }
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", user.id)
  if (roleError) {
    return { ok: false, response: NextResponse.json({ error: roleError.message }, { status: 500 }) }
  }
  const roleNames = (roleRows ?? [])
    .map((row) => (row.roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name))

  if (!roleNames.includes("admin") && !roleNames.includes("manager")) {
    return { ok: false, response: NextResponse.json({ error: NOT_YOUR_EMPLOYEE }, { status: 403 }) }
  }

  // An admin may always assign.
  if (roleNames.includes("admin")) {
    return { ok: true, user, supabase, roleNames }
  }

  // Otherwise the caller must manage a department the target takes
  // assessments in. This is the same shared-managed-department predicate as
  // can_assign_employee (SQL) and load-manager-rows.ts L12-27.
  const { data: managedRows, error: managedError } = await supabase
    .from("profile_departments")
    .select("department_id")
    .eq("profile_id", user.id)
    .eq("status", "management")
  if (managedError) {
    return { ok: false, response: NextResponse.json({ error: managedError.message }, { status: 500 }) }
  }
  const managedDepartmentIds = (managedRows ?? []).map((row) => row.department_id as number)

  let isManager = false
  if (managedDepartmentIds.length > 0) {
    const { data: targetRows, error: targetError } = await supabase
      .from("profile_departments")
      .select("department_id")
      .eq("profile_id", profileId)
      .eq("status", "assessment")
      .in("department_id", managedDepartmentIds)
      .limit(1)
    if (targetError) {
      return { ok: false, response: NextResponse.json({ error: targetError.message }, { status: 500 }) }
    }
    isManager = (targetRows ?? []).length > 0
  }

  if (!canAssignEmployee({ roleNames, isManager })) {
    return { ok: false, response: NextResponse.json({ error: NOT_YOUR_EMPLOYEE }, { status: 403 }) }
  }
  return { ok: true, user, supabase, roleNames }
}
