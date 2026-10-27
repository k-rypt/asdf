import { getUser } from "@/lib/get-user"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import { SidebarUserMenu } from "@/components/protected/employee/sidebar-user-menu"
import { NotificationBell } from "@/components/protected/notifications/notification-bell"

// Update this list to match your actual site sections/routes.
const employeeSidebarLink = [
  { label: "Overview", href: "/protected/employee" },
  { label: "My Assessments", href: "/protected/employee/assessments" },
]

export async function EmployeeSidebar() {
  const user = await getUser()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <NotificationBell />
            {employeeSidebarLink.map((link) => (
              <SidebarMenuItem key={link.label}>
                <SidebarMenuButton render={<a href={link.href} />}>
                  <span>{link.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {/* Interactive bits (useSidebar, dropdown state) need a Client
           Component — a Server Component can't call hooks, even if it's
           the one that fetched the user. */}
        <SidebarUserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
