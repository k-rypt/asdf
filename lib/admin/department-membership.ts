import { ROLE } from "./role-edit"

export type MembershipStatus = "assessment" | "management"

export type MembershipAction =
  | { action: "promote"; profileIds: string[] }
  | { action: "demote"; profileIds: string[]; replacementId: string | null }
  | { action: "remove"; profileIds: string[] }

export interface MembershipRow {
  profileId: string
  status: MembershipStatus
}

export interface MembershipPlan {
  /** Written first, so a failure part-way never drops someone from the department. */
  insert: MembershipRow[]
  remove: MembershipRow[]
  /** People who need the Manager role before they can open the manager area. */
  grantManagerRole: string[]
  /** True when the department would be left with employees but no manager. */
  leavesNoManager: boolean
}

export type PlanResult = { ok: true; plan: MembershipPlan } | { ok: false; status: 400 | 409; error: string }

/**
 * Pure, no I/O. Validates the admin department-members request body.
 * Ids are de-duplicated; a replacement only makes sense when demoting.
 */
export function parseMembershipAction(body: unknown): MembershipAction | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (!Array.isArray(b.profileIds)) return null
  const profileIds = Array.from(new Set(b.profileIds.filter((id): id is string => typeof id === "string" && id !== "")))
  if (profileIds.length === 0) return null

  if (b.action === "promote" || b.action === "remove") return { action: b.action, profileIds }
  if (b.action === "demote") {
    const replacementId = typeof b.replacementId === "string" && b.replacementId !== "" ? b.replacementId : null
    return { action: "demote", profileIds, replacementId }
  }
  return null
}

/**
 * Pure, no I/O. Turns one admin action into the profile_departments rows to
 * add and remove. Managers and employees are kept apart: making someone a
 * manager takes them out of Assessment Profiles so scheduled assessments
 * don't reach them, and removing a manager puts them back.
 */
export function planMembershipChange(input: {
  request: MembershipAction
  departmentClosed: boolean
  rows: MembershipRow[]
  /** Roles of everyone named in the request (targets and replacement). */
  roleIdsByProfile: Record<string, number[]>
  archivedProfileIds: string[]
}): PlanResult {
  const { request, rows } = input
  if (input.departmentClosed) {
    return { ok: false, status: 409, error: "Reactivate this department before changing its members." }
  }

  const has = (profileId: string, status: MembershipStatus) =>
    rows.some((r) => r.profileId === profileId && r.status === status)
  const isMember = (profileId: string) => rows.some((r) => r.profileId === profileId)
  const archived = (profileId: string) => input.archivedProfileIds.includes(profileId)

  const insert: MembershipRow[] = []
  const remove: MembershipRow[] = []
  const toPromote: string[] = []

  for (const profileId of request.profileIds) {
    if (!isMember(profileId)) {
      return { ok: false, status: 409, error: "Someone you picked is no longer in this department. Refresh and try again." }
    }
  }

  if (request.action === "promote") {
    for (const profileId of request.profileIds) {
      if (has(profileId, "management")) {
        return { ok: false, status: 409, error: "Someone you picked is already a manager here." }
      }
      toPromote.push(profileId)
    }
  } else if (request.action === "demote") {
    for (const profileId of request.profileIds) {
      if (!has(profileId, "management")) {
        return { ok: false, status: 409, error: "Someone you picked isn't a manager here." }
      }
      remove.push({ profileId, status: "management" })
      if (!has(profileId, "assessment")) insert.push({ profileId, status: "assessment" })
    }
    if (request.replacementId) {
      const replacementId = request.replacementId
      if (request.profileIds.includes(replacementId) || !has(replacementId, "assessment") || has(replacementId, "management")) {
        return { ok: false, status: 400, error: "Pick a replacement from this department's Assessment Profiles." }
      }
      toPromote.push(replacementId)
    }
  } else {
    for (const profileId of request.profileIds) {
      for (const r of rows) if (r.profileId === profileId) remove.push(r)
    }
  }

  for (const profileId of toPromote) {
    if (archived(profileId)) {
      return { ok: false, status: 409, error: "Reactivate this account before making them a manager." }
    }
    insert.push({ profileId, status: "management" })
    if (has(profileId, "assessment")) remove.push({ profileId, status: "assessment" })
  }

  const grantManagerRole = toPromote.filter((id) => !(input.roleIdsByProfile[id] ?? []).includes(ROLE.manager))

  const key = (r: MembershipRow) => `${r.profileId}:${r.status}`
  const removed = new Set(remove.map(key))
  const after = [...rows.filter((r) => !removed.has(key(r))), ...insert]
  const leavesNoManager =
    after.some((r) => r.status === "assessment") && !after.some((r) => r.status === "management")

  return { ok: true, plan: { insert, remove, grantManagerRole, leavesNoManager } }
}
