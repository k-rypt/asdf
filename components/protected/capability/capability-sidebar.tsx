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

import { SidebarUserMenu } from "@/components/protected/capability/sidebar-user-menu"

// Update this list to match your actual site sections/routes.
const capabilitySidebarLink = [
  { label: "Capabilities", href: "/protected/capability" },
]

export async function CapabilitySidebar() {
  const user = await getUser()

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {capabilitySidebarLink.map((link) => (
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
