// Client side for "Role Swicher" component.
// User with multiple roles can switch between them using this component.

"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

import * as Dialog from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type RoleMenuItem = {
  roleId: number
  label: string
  sublabel?: string
  href: string
}

export function RoleSwitcherMenu({ items }: { items: RoleMenuItem[] }) {
  const router = useRouter()
  const pathname = usePathname()

  // 1. CONTROLLED STATE
  // We use controlled state for the Dialog instead of nesting a <DialogTrigger> inside the menu.
  // This solves two problems:
  // - Base UI's DialogTrigger expects a native <button>. DropdownMenuItem renders a <div>/<li>. Mixing them causes accessibility crashes.
  // - By putting the <Dialog> at the root of this component, we ensure it isn't destroyed if the DropdownMenuSubContent closes.
  const [selectedRole, setSelectedRole] = useState<RoleMenuItem | null>(null)

  // Only one role held — nothing to switch between, just show the current context.
  if (items.length <= 1) {
    const only = items[0]
    if (!only) return null
    return (
      <div className="flex flex-col px-3 py-2 text-sm">
        <span className="font-medium">{only.label}</span>
        {only.sublabel && (
          <span className="text-xs text-muted-foreground">{only.sublabel}</span>
        )}
      </div>
    )
  }

  const active = items.find((item) => pathname?.startsWith(item.href)) ?? items[0]

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className="flex h-auto items-start gap-0 py-2 w-full cursor-pointer "
        >
          <span className="flex justify-between gap-2 w-full">
            {active.label}
          </span>
          {active.sublabel && (
            <span className="text-muted-foreground">{active.sublabel}</span>
          )}
        </DropdownMenuSubTrigger>
        
        <DropdownMenuSubContent alignOffset={-5}>
          {items.map((item) => (
            <DropdownMenuItem 
              key={item.roleId}
              onClick={(e) => {
                // 2. PREVENT PARENT UNMOUNTING
                // This component is rendered inside the parent `SidebarUserMenu`'s DropdownMenu.
                // If we let this click bubble up, the parent dropdown will close.
                // When the parent closes, this ENTIRE component (including our Dialog) gets unmounted from the DOM!
                // We prevent default to keep the dropdown open in the background so our Dialog survives.
                e.preventDefault()
                setSelectedRole(item)
              }}
              // Instructs Base UI not to fire its internal close-menu logic.
              closeOnClick={false}
              className="flex flex-col items-start gap-0 cursor-pointer"
            >
              <span className="font-medium">{item.label}</span>
              {item.sublabel && (
                <span className="text-muted-foreground">{item.sublabel}</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* 3. ROOT-LEVEL DIALOG */}
      {/* Lives outside the DropdownMenu tree, opens when `selectedRole` is set */}
      <Dialog.Dialog open={!!selectedRole} onOpenChange={(open) => !open && setSelectedRole(null)}>
        <Dialog.DialogContent>
          <Dialog.DialogHeader>
            <Dialog.DialogTitle>Switch Role</Dialog.DialogTitle>
            <Dialog.DialogDescription>
              Are you sure you want to switch role as <strong>{selectedRole?.label}</strong>?
              <br /><br />
              Make sure to save or complete your current task first before switching a role.
            </Dialog.DialogDescription>
          </Dialog.DialogHeader>
          <Dialog.DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRole(null)}>Cancel</Button>
            <Button onClick={() => {
              if (selectedRole) {
                router.replace(selectedRole.href)
              }
              setSelectedRole(null)
            }}>
              Proceed
            </Button>
          </Dialog.DialogFooter>
        </Dialog.DialogContent>
      </Dialog.Dialog>
    </>
  )
}