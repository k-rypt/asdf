"use client"

import Link from "next/link"
import { LogOutIcon, User2 } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/logout"
import { ThemeSubMenu } from "@/components/theme-toggle"

interface ProfileInfo {
  id: string
  given_name: string
  last_name: string
  job_title: string
  email?: string
}

export function CapabilityUserMenu({ 
  ProfileInfo,
  roleSwitcher 
}: { 
  ProfileInfo: ProfileInfo | null
  roleSwitcher?: React.ReactNode 
}) {
  const displayName = ProfileInfo ? `${ProfileInfo.given_name} ${ProfileInfo.last_name}` : "Username"
  const email = ProfileInfo?.email ?? "Unknown email"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="w-fit flex gap-2 p-2 cursor-pointer">
            <User2 />
            <span>{displayName}</span>
          </Button>   
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex flex-col space-y-1 p-2 text-sm">
          <span className="font-medium">{displayName}</span>
          <span className="text-muted-foreground text-xs">{email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/protected/capability/profile" />}>
          View Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Role Switcher</DropdownMenuLabel>
          {roleSwitcher}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeSubMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            signOut()
          }}
        >
          <LogOutIcon className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
