"use client"

import { usePathname } from "next/navigation"
import { ChartColumn, LayoutDashboard, UserRound } from "lucide-react"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Update this list to match your actual site sections/routes.
const managerSidebarLink = [
  { label: "Overview", href: "/protected/manager", icon: LayoutDashboard },
  { label: "Stats", href: "/protected/manager/stats", icon: ChartColumn },
  { label: "Assign Capability", href: "/protected/manager/capabilityassign", icon: UserRound },
]

export function ManagerSidebarNav() {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarMenu>
        {managerSidebarLink.map((link) => {
          // Checks if the current URL matches the link's href
          const isActive = pathname === link.href

          return (
            <SidebarMenuItem key={link.label}>
              <SidebarMenuButton isActive={isActive} render={<a href={link.href} />}>
                <link.icon />
                <span>{link.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
