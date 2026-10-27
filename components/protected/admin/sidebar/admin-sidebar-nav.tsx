"use client"

import { usePathname } from "next/navigation"
import { LayoutDashboard, ClipboardList, ListChecks, Users, GraduationCap, Building } from "lucide-react"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const adminSidebarLink = [
  { label: "Overview", href: "/protected/admin", icon: LayoutDashboard },
  { label: "Assessments", href: "/protected/admin/assessments", icon: ClipboardList },
  { label: "Approvals", href: "/protected/admin/approvals", icon: ListChecks },
  { label: "Users", href: "/protected/admin/users", icon: Users },
  { label: "Capabilities", href: "/protected/admin/capabilities", icon: GraduationCap },
  { label: "Departments", href: "/protected/admin/departments", icon: Building },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarMenu>
        {adminSidebarLink.map((link) => {
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