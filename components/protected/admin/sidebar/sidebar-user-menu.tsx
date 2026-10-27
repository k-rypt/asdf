// User menu - displays current user, allows them to view profile or log out. Used in the sidebar.

"use client"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { User2, LogOutIcon, ChevronUp } from "lucide-react"

import { signOut } from "@/lib/logout"
import { ThemeSubMenu } from "@/components/theme-toggle"

interface ProfileInfo {
  id: string
  given_name: string
  last_name: string
  job_title: string
  email?: string
}

export function SidebarUserMenu({ 
  ProfileInfo, 
  roleSwitcher 
}: { 
  ProfileInfo: ProfileInfo | null
  roleSwitcher?: React.ReactNode 
}) {
  // User information to be displayed
  const displayName = ProfileInfo ? `${ProfileInfo.given_name} ${ProfileInfo.last_name}`: "Username"
  const emailSubtext =  ProfileInfo?.email ?? "No email available"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <User2 />
            <div className="flex justify-between items-center w-full">
              <span className="w-full">{displayName}</span>
              <ChevronUp/>
            </div>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent>
        <div>
          {/* This part seems bland  */}
          <DropdownMenuGroup className="p-2">
              {/* <h1>{displayName}</h1> */}
              <span className="flex flex-col text-xs text-muted-foreground">{emailSubtext}
              </span>
          </DropdownMenuGroup>
        </div>
        <DropdownMenuSeparator />
        <div>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Role Switcher</DropdownMenuLabel>
            {/* Render the Server Component passed down from the parent */}
            {roleSwitcher}
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
