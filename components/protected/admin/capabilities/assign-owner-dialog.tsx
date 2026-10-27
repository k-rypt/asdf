"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search, Check } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose, DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"

interface Profile {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
}

interface AssignOwnerDialogProps {
  capabilityId: string
  currentOwnerId: string | null
  trigger: React.ReactNode
}

/** Admin-only: saves through /api/admin/capabilities/[capability]/owner. */
export function AssignOwnerDialog({ capabilityId, currentOwnerId, trigger }: AssignOwnerDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [selected, setSelected] = useState<string | null>(currentOwnerId)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`/api/admin/capabilities/${capabilityId}/owner`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "Failed to load capability owners.")
        if (!cancelled) setProfiles(data.candidates as Profile[])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load capability owners.")
      })
    return () => {
      cancelled = true
    }
  }, [open, capabilityId])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setSearch("")
      setError(null)
      setSelected(currentOwnerId)
    }
  }

  const q = search.toLowerCase()
  const filtered = (profiles ?? []).filter(
    (p) =>
      p.given_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q)
  )

  function handleSave() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/owner`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: selected }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "Failed to save owner.")
        // 207: the owner was saved but their assignment row was not (see
        // lib/admin/owner-assignment-sync.ts). Close and refresh anyway --
        // the owner did change -- but say so rather than reporting success.
        if (res.status === 207) {
          setOpen(false)
          router.refresh()
          toast.add({
            title: "Owner saved with a warning",
            description: data?.warning ?? "The owner's assignment row could not be updated.",
            type: "error",
          })
          return
        }
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save owner.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Capability Owner</DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search capability owners..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y rounded-md border">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
          >
            <p className="text-sm text-muted-foreground">No owner</p>
            {selected === null && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
          {profiles === null && !error ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No capability owners found.</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium">{p.given_name} {p.last_name}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </div>
                {selected === p.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleSave} disabled={isPending || profiles === null || selected === currentOwnerId}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
