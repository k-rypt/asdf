import type { GuardResult } from "./account-status"

/** roles.id values -- fixed rows in the roles table. */
export const ROLE = { admin: 1, manager: 2, capabilityOwner: 3, employee: 4 } as const

export const ROLE_OPTIONS = [
  { id: ROLE.admin, label: "Admin" },
  { id: ROLE.manager, label: "Manager" },
  { id: ROLE.capabilityOwner, label: "Capability owner" },
  { id: ROLE.employee, label: "Employee" },
] as const

const KNOWN_ROLE_IDS = new Set<number>(Object.values(ROLE))

export interface RoleEditCheckInput {
  callerId: string
  targetId: string
  targetExists: boolean
  targetArchived: boolean
  currentRoleIds: number[]
  nextRoleIds: number[]
  /** Admins whose status <> 'inactive', including the target. */
  nonInactiveAdminCount: number
  /** Assessments the target is taking right now (live in-progress attempts). */
  liveAssessmentNames: string[]
}

/** Pure guard for the Edit roles route -- no I/O, so it's unit-testable. */
export function checkRoleEditAllowed(input: RoleEditCheckInput): GuardResult {
  if (input.targetId === input.callerId) {
    return { ok: false, status: 400, error: "You can't change your own roles." }
  }
  if (!input.targetExists) {
    return { ok: false, status: 404, error: "User not found." }
  }
  if (input.targetArchived) {
    return { ok: false, status: 409, error: "Reactivate this account before changing its roles." }
  }
  if (input.nextRoleIds.length === 0) {
    return { ok: false, status: 400, error: "Keep at least one role -- without one they can't sign in." }
  }
  if (input.nextRoleIds.some((id) => !KNOWN_ROLE_IDS.has(id))) {
    return { ok: false, status: 400, error: "Unknown role." }
  }

  const removing = (role: number) => input.currentRoleIds.includes(role) && !input.nextRoleIds.includes(role)
  if (removing(ROLE.admin) && input.nonInactiveAdminCount <= 1) {
    return { ok: false, status: 409, error: "You can't remove Admin from the last active admin." }
  }
  // Without the employee role every assessment API call is refused, so a
  // live attempt would break part-way -- same reasoning as archiving.
  if (removing(ROLE.employee) && input.liveAssessmentNames.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `They're taking ${input.liveAssessmentNames.join(", ")} right now. You can remove Employee once they finish.`,
    }
  }
  return { ok: true }
}

/** Reminders for roles that need one more step elsewhere before they do anything. */
export function roleSetupNotes(
  roleIds: number[],
  setup: { managesDepartment: boolean; ownsCapability: boolean }
): string[] {
  const notes: string[] = []
  if (roleIds.includes(ROLE.manager) && !setup.managesDepartment) {
    notes.push("They won't see a team until you make them a department manager in Departments.")
  }
  if (roleIds.includes(ROLE.capabilityOwner) && !setup.ownsCapability) {
    notes.push("They won't own anything until you set them as a capability's owner on its page.")
  }
  return notes
}
