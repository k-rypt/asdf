import { redirect, RedirectType } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { protectedHomeFor } from "@/lib/auth/routing"

// This page is the fallback destination whenever a protected/* layout
// bounces a user for a role mismatch (e.g. admin/layout.tsx sending a
// non-admin to /protected/employee, which in turn sends a non-employee
// here), as well as the target of any direct navigation to /protected
// itself and of every login. Route by role instead of sending everyone to
// /auth, which made an authenticated user look like they'd lost their
// session.
export default async function ProtectedIndexPage() {
  const supabase = createClient(await cookies())

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (!user) {
    // The proxy let this request through, so it saw a user -- a miss here
    // means the auth check failed on this request. Logged because it has
    // bounced fresh logins back to /auth on a cold dev server.
    console.warn("/protected: no user, sending to /auth", {
      error: userError ? `${userError.name}: ${userError.message}` : null,
    })
    redirect("/auth")
  }

  const { data: profileRoles, error: profileRolesError } = await supabase
    .from("profile_roles")
    .select("profile_role")
    .eq("profile_id", user.id)

  if (profileRolesError) {
    // Not "no roles": signing the user out over a failed query would be wrong.
    throw new Error(`Couldn't load roles for ${user.id}: ${profileRolesError.message}`)
  }

  const roleIds = (profileRoles ?? [])
    .map((row) => Number(row.profile_role))
    .filter((id) => !isNaN(id))

  const home = protectedHomeFor(roleIds)
  if (!home) {
    // Signed in but no role. Redirecting to /auth would loop (the proxy
    // sends signed-in users back here), so sign out and explain instead.
    // A page can't clear cookies, so a route handler does it.
    redirect("/auth/no-role")
  }

  redirect(home, RedirectType.replace)
}
