/** Shown wherever a change is refused because the capability isn't theirs. */
export const NOT_YOUR_CAPABILITY = "You can only change capabilities you own."

/**
 * App-side mirror of the database's can_manage_capability(): an admin, or
 * the capability's owner who still holds the capability-owner role.
 * Client-safe (no server-only import) so browser code can share the message.
 */
export function canManageCapability({
  roleNames,
  userId,
  ownerId,
}: {
  roleNames: string[]
  userId: string
  ownerId: string | null
}): boolean {
  if (roleNames.includes("admin")) return true
  return roleNames.includes("capability owner") && ownerId !== null && ownerId === userId
}

/** Shown when a non-manager tries to assign employees to a capability. */
export const NOT_YOUR_EMPLOYEE =
  "Assigning employees to a capability is a manager function. Ask a manager for your department."

/**
 * App-side mirror of the database's can_assign_employee(): an admin, or a
 * manager acting within a department they manage.
 *
 * Owning the capability grants nothing here -- assignment is a manager
 * function, not an owner function (see the 2026-10-20 manager-assignment
 * design, D4/D6). `isManager` is whether the target employee is in a
 * department the caller manages; the caller resolves that from
 * profile_departments, the same way can_assign_employee does.
 * Client-safe (no server-only import) so browser code can share the message.
 */
export function canAssignEmployee({
  roleNames,
  isManager,
}: {
  roleNames: string[]
  isManager: boolean
}): boolean {
  if (roleNames.includes("admin")) return true
  return isManager
}
