"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface InProgressAttempt {
  attemptId: number
  assessmentName: string
}

interface ArchiveUserDialogProps {
  user: { id: string; name: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onArchived: () => void
}

export function ArchiveUserDialog({ user, open, onOpenChange, onArchived }: ArchiveUserDialogProps) {
  const [inProgress, setInProgress] = useState<InProgressAttempt[] | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`/api/admin/users/${user.id}/archive`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "Failed to check in-progress assessments.")
        if (!cancelled) setInProgress(data.inProgress as InProgressAttempt[])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to check in-progress assessments.")
      })
    return () => {
      cancelled = true
    }
  }, [open, user.id])

  async function handleArchive() {
    setArchiving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/archive`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to archive account.")
      onArchived()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive account.")
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {user.name}?</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {error && <p className="text-destructive">{error}</p>}
          <p className="text-muted-foreground">
            They won&apos;t be able to sign in, and they&apos;ll be hidden from assignment lists. Their results are
            kept, and you can reactivate the account at any time.
          </p>
          {inProgress === null && !error && <p className="text-muted-foreground">Checking for in-progress assessments…</p>}
          {inProgress && inProgress.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="font-medium">
                {user.name} is taking {inProgress.map((a) => a.assessmentName).join(", ")} right now.
              </p>
              <p className="mt-1 text-muted-foreground">
                You can archive the account once they finish. Archiving now would close their attempt, and they get
                only one.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button variant="destructive" onClick={handleArchive} disabled={archiving || inProgress === null || inProgress.length > 0}>
            {archiving ? "Archiving..." : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
