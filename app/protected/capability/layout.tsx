import { redirect } from "next/navigation"
import { SidebarProvider, SidebarMenu } from "@/components/ui/sidebar"
import { getUser } from "@/lib/get-user"
import { CapabilityUserMenu } from "@/components/protected/capability/capability-user-menu"
import { RoleSwitcher } from "@/components/protected/role_switch/role-switcher"
import { getUserRoles } from "@/lib/get-user-roles"
import { NotificationBell } from "@/components/protected/notifications/notification-bell"
import { ThemeToggle } from "@/components/theme-toggle"
import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect("/auth")
  }

  // Non-capability-owners shouldn't be able to reach this area by
  // navigating to the URL directly. Mirrors the same check in
  // app/protected/admin/layout.tsx and app/protected/employee/layout.tsx.
  // The generate-assessment API route (require-capability-admin-client.ts)
  // also accepts 'admin' here, but admins already have their own area at
  // /protected/admin/capabilities, so this gate stays capability-owner-only.
  const roles = await getUserRoles(user.id)
  if (!roles.includes(3)) {
    redirect("/protected")
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  return (
    <SidebarProvider>
      <main className="flex min-h-screen w-full flex-col">
        <header className="flex h-16 shrink-0 items-center justify-center border-b px-4 lg:px-6 sticky top-0 bg-background">
          <div className="lg:max-w-6xl w-full flex justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold tracking-tight">RSACT</span>
            </div>
            <div className="flex items-center gap-3">
              <SidebarMenu>
                <NotificationBell />
              </SidebarMenu>
              <ThemeToggle />
              <CapabilityUserMenu ProfileInfo={profile} roleSwitcher={<RoleSwitcher />} />
            </div>
          </div>
        </header>
        <div className="flex-1 lg:p-6">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
