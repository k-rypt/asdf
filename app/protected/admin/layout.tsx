import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/protected/admin/sidebar/admin-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { getUser } from "@/lib/get-user"
import { getUserRoles } from "@/lib/get-user-roles"

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Kunin muna yung data ni user para ma-check kung naka-login siya bago ipakita yung layout.
  const user = await getUser()

  // Kung wala, redirect sa login page.
  if (!user) {
    redirect("/auth")
  }

  // Admins only -- same gate as the manager, capability and employee
  // layouts. /protected then routes the user to their own area.
  const roles = await getUserRoles(user.id)
  if (!roles.includes(1)) {
    redirect("/protected")
  }

  return (
    <SidebarProvider>
      <AdminSidebar/>
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
