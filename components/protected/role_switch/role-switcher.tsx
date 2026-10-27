import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { RoleSwitcherMenu, type RoleMenuItem } from "@/components/protected/role_switch/role-switcher-menu"

// Keep this in sync with the `roles` table (id -> name) and your app/protected/* folders.
const ROLE_META: Record<number, { label: string; href: string; needsDepartment: boolean }> = {
  1: { label: "Admin", href: "/protected/admin", needsDepartment: false },
  2: { label: "Manager", href: "/protected/manager", needsDepartment: true },
  3: { label: "Capability Owner", href: "/protected/capability", needsDepartment: false },
  4: { label: "Employee", href: "/protected/employee", needsDepartment: true },
}

export async function RoleSwitcher() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profileRoles } = await supabase
    .from("profile_roles")
    .select("profile_role")
    .eq("profile_id", user.id)

  const roleIds = (profileRoles ?? [])
    .map((row) => Number(row.profile_role))
    .filter((id) => ROLE_META[id])

  if (roleIds.length === 0) return null

  // Only hit profile_departments if at least one held role actually needs a department label.
  const needsDepartments = roleIds.some((id) => ROLE_META[id].needsDepartment)
  let departmentNames: string[] = []

  if (needsDepartments) {
    const { data: deptRows } = await supabase
      .from("profile_departments")
      .select("departments(name)")
      .eq("profile_id", user.id)

    departmentNames = (deptRows ?? [])
      .map((row) => (row.departments as unknown as { name: string } | null)?.name)
      .filter((name): name is string => Boolean(name))
  }

  const items: RoleMenuItem[] = roleIds.map((id) => {
    const meta = ROLE_META[id]
    return {
      roleId: id,
      label: meta.label,
      sublabel: meta.needsDepartment && departmentNames.length > 0
        ? departmentNames.join(", ")
        : undefined,
      href: meta.href,
    }
  })

  return <RoleSwitcherMenu items={items} />
}