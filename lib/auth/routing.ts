/**
 * Pages a signed-in user is sent away from (to /protected) by the proxy:
 * the landing page and both login pages. /auth/confirm, /auth/set-password
 * and /auth/no-role are left alone because the user is signed in there on
 * purpose (invite flow, sign-out).
 */
export function redirectsSignedInUser(pathname: string): boolean {
  return pathname === "/" || pathname === "/auth" || pathname.startsWith("/auth/login")
}

/**
 * Home page for a user's roles, by lowest role id (1 admin, 2 manager,
 * 3 capability owner, 4 employee). Null when the user has no roles.
 */
export function protectedHomeFor(roleIds: number[]): string | null {
  if (roleIds.length === 0) return null
  switch (Math.min(...roleIds)) {
    case 1:
      return "/protected/admin"
    case 2:
      return "/protected/manager"
    case 3:
      return "/protected/capability"
    case 4:
      return "/protected/employee"
    default:
      return "/protected/unauthorized"
  }
}
