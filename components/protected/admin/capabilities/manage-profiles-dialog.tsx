"use client"

import { useState, useMemo, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, X, UserRound } from "lucide-react"
import { changedRows } from "@/lib/admin/changed-rows"
import { toast } from "@/components/ui/toast"

export interface Profile {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
}

interface ManageProfilesDialogProps {
  capabilityId: string
  assignedProfiles: { profile_id: string; profiles: Profile | null }[]
  /**
   * The people this caller is allowed to assign. Deliberately a prop, not a
   * query inside this component: the two surfaces need different scopes --
   * an admin sees every employee, a manager only their own department's
   * (2026-10-20 manager-assignment design, D3a). Fetching globally here is
   * what would let a manager be offered someone the database then refuses.
   */
  candidates: Profile[]
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function ManageProfilesDialog({
  capabilityId,
  assignedProfiles: initialAssigned,
  candidates,
  open,
  onOpenChange,
}: ManageProfilesDialogProps) {
  const [search, setSearch] = useState("")
  const [assigned, setAssigned] = useState<Profile[]>(
    initialAssigned.map((a) => a.profiles!).filter(Boolean)
  )
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const assignedIds = new Set(assigned.map((p) => p.id))

  const filtered = candidates.filter((p) => {
    if (assignedIds.has(p.id)) return false
    const q = search.toLowerCase()
    return (
      p.given_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
    )
  })

  function addProfile(p: Profile) {
    setAssigned((prev) => [...prev, p])
  }

  function removeProfile(profileId: string) {
    setAssigned((prev) => prev.filter((p) => p.id !== profileId))
  }

  async function handleSave() {
    startTransition(async () => {
      // Find added and removed profiles compared to initial
      const initialIds = new Set(initialAssigned.map((a) => a.profile_id))
      const currentIds = new Set(assigned.map((p) => p.id))

      const toAdd = assigned.filter((p) => !initialIds.has(p.id))
      const toRemove = [...initialIds].filter((id) => !currentIds.has(id))

      try {
        if (toAdd.length > 0) {
          const { error } = await supabase.from("profile_capabilities").insert(
            toAdd.map((p) => ({
              profile_id: p.id,
              capability_id: Number(capabilityId),
              assignment_type: "assessment",
              added_at: new Date().toISOString(),
            }))
          )
          if (error) throw new Error(error.message)
        }
        if (toRemove.length > 0) {
          changedRows(
            await supabase
              .from("profile_capabilities")
              .delete()
              .eq("capability_id", Number(capabilityId))
              .in("profile_id", toRemove)
              .select("profile_id")
          )
        }
      } catch (err) {
        toast.add({
          title: "Couldn't update assigned profiles",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
        return
      }

      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Assigned Profiles</DialogTitle>
        </DialogHeader>

        {/* Currently assigned */}
        {assigned.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Assigned</p>
            <div className="flex flex-wrap gap-2">
              {assigned.map((p) => (
                <Badge key={p.id} variant="secondary" className="gap-1.5 pr-1.5 py-1">
                  <UserRound className="h-3 w-3" />
                  {p.given_name} {p.last_name}
                  <button
                    type="button"
                    onClick={() => removeProfile(p.id)}
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search employees */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Add Employees</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto divide-y rounded-md border">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {search ? "No results found." : "No one left to assign."}
            </div>
          ) : (
            filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{p.given_name} {p.last_name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addProfile(p)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
