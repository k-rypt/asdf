"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ReactivateUserDialogProps {
  user: { id: string; name: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onReactivated: () => void
}

export function ReactivateUserDialog({ user, open, onOpenChange, onReactivated }: ReactivateUserDialogProps) {
  const [reactivating, setReactivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReactivate() {
    setReactivating(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reactivate`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to reactivate account.")
      onReactivated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate account.")
    } finally {
      setReactivating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reactivate {user.name}?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {error && <p className="text-destructive">{error}</p>}
          <p className="text-muted-foreground">
            They&apos;ll be able to sign in again with their previous roles and capabilities.
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleReactivate} disabled={reactivating}>
            {reactivating ? "Reactivating..." : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
