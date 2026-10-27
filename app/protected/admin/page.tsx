import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { buildManagerRows, type CapabilityAssignmentRow, type ProfileRow } from "@/lib/assessment/build-manager-rows"
import { buildOverviewSummary } from "@/lib/admin/overview-summary"
import { recentActivity, weeklyCompletions, weeksWindowStart, type ActivityEvent } from "@/lib/admin/overview-activity"
import { statsByCapability } from "@/lib/assessment/team-stats"
import { AdminOverview } from "@/components/protected/admin/overview/admin-overview"

export default async function AdminPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const WEEKS = 12
  const ACTIVITY_LIMIT = 10
  const now = new Date()

  const [
    { data: profiles },
    { data: roleRows },
    { data: capabilities },
    { data: departments },
    { data: departmentMembers },
    { data: assignments },
    { count: pendingApprovals },
    { count: completedThisMonth },
    { data: weekCompletions },
    { data: recentCompletions },
    { data: recentDecisions },
    { data: recentOpenings },
    { data: recentUsers },
  ] = await Promise.all([
    supabase.from("profiles").select("id, given_name, last_name, email").neq("status", "inactive"),
    supabase.from("profile_roles").select("profile_id, profile_role"),
    supabase.from("capabilities").select("id, name, status, owner_id, current_preset"),
    supabase.from("departments").select("id, name, status"),
    // profile_departments has two FKs to profiles (profile_id, added_by), so
    // the embed must name which one or PostgREST rejects it as ambiguous.
    supabase
      .from("profile_departments")
      .select("department_id, status, profiles!profile_departments_profile_id_fkey!inner(status)")
      .neq("profiles.status", "inactive"),
    supabase
      .from("profile_capabilities")
      .select("profile_id, capability_id, added_at, capabilities(name), profiles!inner(status)")
      .neq("assignment_type", "management")
      .neq("profiles.status", "inactive"),
    supabase
      .from("preset_current_status")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_approval"),
    supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("completed_at", monthStart.toISOString()),
    supabase
      .from("attempts")
      .select("completed_at")
      .eq("status", "completed")
      .gte("completed_at", weeksWindowStart(WEEKS, now).toISOString()),
    // Recent activity: the newest few from each source, merged below.
    supabase
      .from("attempts")
      .select("id, completed_at, profiles(given_name, last_name), assessments(capability_id, capabilities(name))")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("preset_approvals")
      .select("id, action, created_at, profiles(given_name, last_name), question_presets(name, capability_id)")
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("assessments")
      .select("id, available_from, capability_id, capabilities(name)")
      .in("status", ["published", "archived"])
      .lte("available_from", now.toISOString())
      .order("available_from", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from("profiles")
      .select("id, given_name, last_name, created_at")
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ])

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p as ProfileRow]))
  const roleIdsByProfile = new Map<string, number[]>()
  for (const r of roleRows ?? []) {
    roleIdsByProfile.set(r.profile_id, [...(roleIdsByProfile.get(r.profile_id) ?? []), r.profile_role])
  }

  // Read-only page: skipFlagging keeps it from writing deadline flags; the
  // overdue status still comes through via the expired-window fallback.
  const rows = await buildManagerRows(
    supabase,
    (assignments ?? []) as unknown as CapabilityAssignmentRow[],
    profileById,
    { skipFlagging: true }
  )

  const memberCounts = new Map<number, { managers: number; employees: number }>()
  for (const m of departmentMembers ?? []) {
    const counts = memberCounts.get(m.department_id) ?? { managers: 0, employees: 0 }
    if (m.status === "management") counts.managers++
    else counts.employees++
    memberCounts.set(m.department_id, counts)
  }

  const summary = buildOverviewSummary({
    profiles: (profiles ?? []).map((p) => ({ id: p.id, roleIds: roleIdsByProfile.get(p.id) ?? [] })),
    capabilities: (capabilities ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status ?? "active",
      ownerId: c.owner_id,
      currentPreset: c.current_preset,
    })),
    departments: (departments ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status ?? "active",
      ...(memberCounts.get(d.id) ?? { managers: 0, employees: 0 }),
    })),
    assignments: rows.map((r) => ({
      capabilityId: r.capabilityId,
      assessmentId: r.assessmentId,
      status: r.assessmentStatus,
    })),
    pendingApprovals: pendingApprovals ?? 0,
    completedThisMonth: completedThisMonth ?? 0,
  })

  // To-one embeds can arrive as an object or a one-element array.
  const one = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined))
  type Named = { given_name: string | null; last_name: string | null }
  const fullName = (p: Named | undefined) => (p ? `${p.given_name ?? ""} ${p.last_name ?? ""}`.trim() || "Someone" : "Someone")
  const capabilityHref = (id: number | null | undefined) => (id ? `/protected/admin/capabilities/${id}` : null)

  const events: ActivityEvent[] = [
    ...(recentCompletions ?? []).map((a) => {
      const assessment = one(a.assessments as unknown as { capability_id: number; capabilities: unknown })
      const capability = one(assessment?.capabilities as { name: string } | { name: string }[] | null)
      return {
        key: `completed-${a.id}`,
        kind: "completed" as const,
        at: a.completed_at as string,
        text: `${fullName(one(a.profiles as unknown as Named))} completed ${capability?.name ?? "an assessment"}`,
        href: capabilityHref(assessment?.capability_id),
      }
    }),
    ...(recentDecisions ?? []).map((d) => {
      const preset = one(d.question_presets as unknown as { name: string; capability_id: number })
      const who = fullName(one(d.profiles as unknown as Named))
      const name = preset?.name ?? "a preset"
      const kind = d.action as "submitted" | "approved" | "rejected"
      return {
        key: `preset-${d.id}`,
        kind,
        at: d.created_at as string,
        text: kind === "submitted" ? `${who} submitted ${name} for approval` : `${who} ${kind} ${name}`,
        href: kind === "submitted" ? "/protected/admin/approvals" : capabilityHref(preset?.capability_id),
      }
    }),
    ...(recentOpenings ?? []).map((a) => ({
      key: `opened-${a.id}`,
      kind: "opened" as const,
      at: a.available_from as string,
      text: `${one(a.capabilities as unknown as { name: string })?.name ?? "An"} assessment opened`,
      href: capabilityHref(a.capability_id),
    })),
    ...(recentUsers ?? []).map((p) => ({
      key: `joined-${p.id}`,
      kind: "joined" as const,
      at: p.created_at as string,
      text: `${fullName(p)} was added`,
      href: "/protected/admin/users",
    })),
  ]

  return (
    <AdminOverview
      summary={summary}
      weeks={weeklyCompletions((weekCompletions ?? []).map((a) => a.completed_at as string), WEEKS, now)}
      stats={statsByCapability(rows)}
      activity={recentActivity(events, ACTIVITY_LIMIT, now)}
      now={now.getTime()}
    />
  )
}
