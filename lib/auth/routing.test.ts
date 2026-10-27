import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { protectedHomeFor, redirectsSignedInUser } from "./routing"

describe("redirectsSignedInUser", () => {
  it("sends signed-in users away from the landing and login pages", () => {
    expect(redirectsSignedInUser("/")).toBe(true)
    expect(redirectsSignedInUser("/auth")).toBe(true)
    expect(redirectsSignedInUser("/auth/login")).toBe(true)
  })

  it("leaves the invite and sign-out routes alone, where the user is signed in on purpose", () => {
    expect(redirectsSignedInUser("/auth/confirm")).toBe(false)
    expect(redirectsSignedInUser("/auth/set-password")).toBe(false)
    expect(redirectsSignedInUser("/auth/no-role")).toBe(false)
  })

  it("leaves the invite flow's error page alone too, so it can explain the failure", () => {
    // app/auth/confirm/route.ts redirects failed verifications here. If the
    // proxy ever claimed this path, the user would be bounced to /protected
    // and then to login, showing "no role" instead of "this link expired".
    expect(redirectsSignedInUser("/auth/error")).toBe(false)
  })

  it("leaves app pages alone", () => {
    expect(redirectsSignedInUser("/protected")).toBe(false)
    expect(redirectsSignedInUser("/protected/employee")).toBe(false)
  })
})

describe("auth redirect targets exist on disk", () => {
  // The check above cannot catch a missing page: redirectsSignedInUser
  // returns false for every path it does not explicitly list, so a
  // nonexistent /auth/error passes it happily. That is exactly how
  // app/auth/confirm/route.ts came to redirect a 404 -- the path looked
  // fine in every test and in review. So assert on the filesystem instead.

  /** Paths that some route redirects to, and which must therefore render. */
  const REQUIRED_PAGES = [
    // app/auth/confirm/route.ts L27 -- failed/expired/reused token.
    { path: "/auth/error", file: "app/auth/error/page.tsx" },
    // The invite email's redirectTo (app/api/admin/users/invite/route.ts).
    { path: "/auth/set-password", file: "app/auth/set-password/page.tsx" },
    // app/auth/confirm/route.ts's `next` default.
    { path: "/auth/login", file: "app/auth/login/page.tsx" },
  ]

  it.each(REQUIRED_PAGES)("$path has a page at $file", ({ file }) => {
    expect(existsSync(file)).toBe(true)
  })
})

describe("protectedHomeFor", () => {
  it("routes by the lowest role id", () => {
    expect(protectedHomeFor([4])).toBe("/protected/employee")
    expect(protectedHomeFor([4, 2])).toBe("/protected/manager")
    expect(protectedHomeFor([3, 1])).toBe("/protected/admin")
    expect(protectedHomeFor([3])).toBe("/protected/capability")
  })

  it("returns null when the user has no roles", () => {
    expect(protectedHomeFor([])).toBeNull()
  })
})
