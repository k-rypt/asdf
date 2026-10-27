import { ROLE } from "./role-edit"

export interface OverviewProfile {
  id: string
  roleIds: number[]
}

export interface OverviewCapability {
  id: number
  name: string
  status: string
  ownerId: string | null
  currentPreset: number | null
}

export interface OverviewDepartment {
  id: number
  name: string
  status: string
  managers: number
  employees: number
}

/** One employee/capability assignment, reduced to what the overview needs. */
export interface OverviewAssignment {
  capabilityId: number
  assessmentId: number | null
  status: "not_yet_open" | "not_started" | "in_progress" | "completed" | "closed" | "overdue"
}

export interface OverviewInput {
  /** Non-archived profiles only. */
  profiles: OverviewProfile[]
  capabilities: OverviewCapability[]
  departments: OverviewDepartment[]
  /** Test-taker assignments of non-archived profiles. */
  assignments: OverviewAssignment[]
  pendingApprovals: number
  completedThisMonth: number
}

export interface AttentionItem {
  key: string
  tone: "critical" | "warning"
  title: string
  detail: string
  href: string
}

export interface OverviewSummary {
  users: { active: number; admins: number; managers: number; owners: number; employees: number }
  capabilities: { active: number; noOwner: number; noPreset: number }
  assessments: { inProgress: number; completedThisMonth: number }
  pendingApprovals: number
  attention: AttentionItem[]
}

const CAPABILITY_HREF = "/protected/admin/capabilities"

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Pure, no I/O. Turns the admin Overview's raw counts into the summary
 * cards and the "Needs attention" list. Archived capabilities and closed
 * departments raise nothing -- they're switched off on purpose.
 */
export function buildOverviewSummary(input: OverviewInput): OverviewSummary {
  const hasRole = (p: OverviewProfile, role: number) => p.roleIds.includes(role)
  const activeCapabilities = input.capabilities.filter((c) => c.status === "active")

  const attention: AttentionItem[] = []

  // Overdue employees, one item per capability.
  const overdueByCapability = new Map<number, number>()
  for (const a of input.assignments) {
    if (a.status === "overdue") overdueByCapability.set(a.capabilityId, (overdueByCapability.get(a.capabilityId) ?? 0) + 1)
  }
  for (const c of activeCapabilities) {
    const n = overdueByCapability.get(c.id) ?? 0
    if (n > 0) {
      attention.push({
        key: `overdue-${c.id}`,
        tone: "critical",
        title: `${plural(n, "employee", "employees")} overdue on ${c.name}`,
        detail: "Their assessment window has closed without a completed attempt.",
        href: `${CAPABILITY_HREF}/${c.id}`,
      })
    }
  }

  if (input.pendingApprovals > 0) {
    attention.push({
      key: "approvals",
      tone: "warning",
      title: `${plural(input.pendingApprovals, "preset", "presets")} awaiting approval`,
      detail: "Capability owners are waiting on a decision.",
      href: "/protected/admin/approvals",
    })
  }

  for (const c of activeCapabilities) {
    const assigned = input.assignments.filter((a) => a.capabilityId === c.id)
    if (assigned.length > 0 && assigned.every((a) => a.assessmentId === null)) {
      attention.push({
        key: `no-assessment-${c.id}`,
        tone: "critical",
        title: `${c.name} has no published assessment`,
        detail: `${plural(assigned.length, "employee is", "employees are")} assigned but can't take anything yet.`,
        href: `${CAPABILITY_HREF}/${c.id}`,
      })
    }
  }

  for (const c of activeCapabilities) {
    if (!c.ownerId) {
      attention.push({
        key: `no-owner-${c.id}`,
        tone: "warning",
        title: `${c.name} has no capability owner`,
        detail: "Nobody can author or submit presets for it except an admin.",
        href: `${CAPABILITY_HREF}/${c.id}`,
      })
    }
  }

  for (const c of activeCapabilities) {
    if (c.currentPreset == null) {
      attention.push({
        key: `no-preset-${c.id}`,
        tone: "warning",
        title: `${c.name} has no active preset`,
        detail: "Approve a preset to make it the capability's active one.",
        href: `${CAPABILITY_HREF}/${c.id}`,
      })
    }
  }

  for (const d of input.departments) {
    if (d.status !== "closed" && d.employees > 0 && d.managers === 0) {
      attention.push({
        key: `no-manager-${d.id}`,
        tone: "warning",
        title: `${d.name} has no manager`,
        detail: `${plural(d.employees, "employee has", "employees have")} nobody tracking their progress.`,
        href: `/protected/admin/departments/${d.id}`,
      })
    }
  }

  const noRole = input.profiles.filter((p) => p.roleIds.length === 0).length
  if (noRole > 0) {
    attention.push({
      key: "no-role",
      tone: "warning",
      title: `${plural(noRole, "user has", "users have")} no role`,
      detail: "They can sign in but see nothing until they're given a role.",
      href: "/protected/admin/users",
    })
  }

  return {
    users: {
      active: input.profiles.length,
      admins: input.profiles.filter((p) => hasRole(p, ROLE.admin)).length,
      managers: input.profiles.filter((p) => hasRole(p, ROLE.manager)).length,
      owners: input.profiles.filter((p) => hasRole(p, ROLE.capabilityOwner)).length,
      employees: input.profiles.filter((p) => hasRole(p, ROLE.employee)).length,
    },
    capabilities: {
      active: activeCapabilities.length,
      noOwner: activeCapabilities.filter((c) => !c.ownerId).length,
      noPreset: activeCapabilities.filter((c) => c.currentPreset == null).length,
    },
    assessments: {
      inProgress: input.assignments.filter((a) => a.status === "in_progress").length,
      completedThisMonth: input.completedThisMonth,
    },
    pendingApprovals: input.pendingApprovals,
    attention,
  }
}
