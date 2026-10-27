// User menu - displays current user, allows them to log out. Used in the
// manager sidebar. Same shape as admin's version minus the role switcher
// (manager sidebar deliberately doesn't offer one -- see 2026-09-30 design
// note in app/protected/manager/layout.tsx).

"use client"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { User2, LogOutIcon, ChevronUp } from "lucide-react"

import { signOut } from "@/lib/logout"
import { ThemeSubMenu } from "@/components/theme-toggle"

interface ProfileInfo {
  id: string
  email: string
  given_name: string
  last_name: string
  job_title: string
}

export function SidebarUserMenu({ ProfileInfo }: { ProfileInfo: ProfileInfo | null }) {
  // User information to be displayed
  const displayName = ProfileInfo ? `${ProfileInfo.given_name} ${ProfileInfo.last_name}` : "Username"
  const emailSubtext = ProfileInfo?.email ?? "No email available"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
          >
            <User2 />
            <div className="flex justify-between items-center w-full">
              <span className="w-full">{displayName}</span>
              <ChevronUp />
            </div>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent>
        <div>
          <DropdownMenuGroup className="p-2">
            <span className="flex flex-col text-xs text-muted-foreground">{emailSubtext}</span>
          </DropdownMenuGroup>
        </div>
        <DropdownMenuSeparator />
        <ThemeSubMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOut()
          }}
        >
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
