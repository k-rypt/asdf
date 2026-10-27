import { redirect } from "next/navigation"
import { getUser } from "@/lib/get-user"
import { getUserRoles } from "@/lib/get-user-roles"
import { ManagerSidebar } from "@/components/protected/manager/sidebar/manager-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * First real auth/role gate for this route tree -- app/protected/manager/
 * page.tsx previously had none at all, unlike every other protected area.
 * Mirrors app/protected/employee/layout.tsx's redirect logic exactly.
 *
 * 2026-09-30: added ManagerSidebar, matching the admin/capability/employee
 * SidebarProvider + SidebarTrigger + padded-content shape exactly
 * (components/protected/manager/sidebar/manager-sidebar.tsx). Its user
 * menu deliberately omits the Role Switcher admin's does have -- explicit
 * request, not an oversight.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const roles = await getUserRoles(user.id)
  if (!roles.includes(2)) {
    redirect("/protected")
  }

  return (
    <SidebarProvider>
      <ManagerSidebar />
      <main className="w-full">
        <div className="flex items-center justify-between p-2">
          <SidebarTrigger />
          <ThemeToggle />
        </div>
        <div className="px-6 pb-6">{children}</div>
      </main>
    </SidebarProvider>
  )
}
