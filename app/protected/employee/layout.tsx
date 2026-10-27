import { redirect } from "next/navigation"
import { getUser } from "@/lib/get-user"
import { getUserRoles } from "@/lib/get-user-roles"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect("/auth")
  }

  // Non-employees shouldn't be able to reach the assessment (or anything
  // else in this area) by navigating to the URL directly. Mirrors the same
  // check in app/protected/admin/layout.tsx. RLS on attempts/attempt_answers
  // backs this up at the DB layer -- see the
  // 2026-09-21_attempts_employee_role_gate migration -- so this is a UX
  // gate, not the actual security boundary.
  const roles = await getUserRoles(user.id)
  if (!roles.includes(4)) {
    redirect("/protected")
  }

  // Sidebar chrome lives in (portal)/layout.tsx so the assessment-taking
  // route can render without it.
  return <>{children}</>
}
