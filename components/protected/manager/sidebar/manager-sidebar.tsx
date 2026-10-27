import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { SidebarUserMenu } from "@/components/protected/manager/sidebar/sidebar-user-menu"
import { ManagerSidebarNav } from "@/components/protected/manager/sidebar/manager-sidebar-nav"
import { NotificationBell } from "@/components/protected/notifications/notification-bell"

export async function ManagerSidebar() {
  // 1. Get the current authenticated user
  const user = await getUser()

  if (!user) return null

  // 2. Fetch the profile info from your Supabase profiles table
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarGroup>
          <SidebarMenu>
            <NotificationBell />
            <SidebarMenuItem>
              <h1 className="text-lg font-semibold tracking-tight">RSACT</h1>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent>
        <ManagerSidebarNav />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarUserMenu ProfileInfo={profile} />
      </SidebarFooter>
    </Sidebar>
  )
}
