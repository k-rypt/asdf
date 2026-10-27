"use client"

import type { User } from "@supabase/supabase-js"
import Link from "next/link"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { User2, LogOutIcon } from "lucide-react"

import { signOut } from "@/lib/logout"
import { ThemeSubMenu } from "@/components/theme-toggle"

export function SidebarUserMenu({ user }: { user: User | null }) {
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? "Username"
  const email = user?.email ?? "Unknown email"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
          >
            <User2 />
            <div className="grid flex-1 text-left leading-tight">
              <span className="flex flex-col">{displayName}</span>
              <span className="flex flex-col">{email}</span>
            </div>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuItem render={<Link href="/protected/employee/profile" />}>
          View Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeSubMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
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
