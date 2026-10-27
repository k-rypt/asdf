"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LiveAttemptsNote } from "@/components/protected/admin/live-attempts-note"

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10)
}

interface ApproveDialogProps {
  row: { presetId: number; capabilityId: number; presetName: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onApproved: (assessmentId: number) => void
}

export function ApproveDialog({ row, open, onOpenChange, onApproved }: ApproveDialogProps) {
  const [availableFrom, setAvailableFrom] = useState(todayDateInputValue())
  const [durationDays, setDurationDays] = useState<number | null>(14)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setApproving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/capabilities/${row.capabilityId}/presets/${row.presetId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availableFrom, durationDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to approve preset.")
      onApproved(data.assessmentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve preset.")
    } finally {
      setApproving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve &amp; schedule &quot;{row.presetName}&quot;</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="approve-start-date" className="text-sm font-medium">
              Start date
            </label>
            <input
              id="approve-start-date"
              type="date"
              className="w-40 rounded-md border px-2 py-1.5 text-sm"
              value={availableFrom}
              min={todayDateInputValue()}
              onChange={(e) => setAvailableFrom(e.target.value)}
            />
          </div>
          <p className="text-sm font-medium">Available for</p>
          <div className="flex flex-col gap-1.5">
            {([7, 14, 30, null] as const).map((days) => (
              <label key={String(days)} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="approve-duration"
                  checked={durationDays === days}
                  onChange={() => setDurationDays(days)}
                />
                {days == null ? "No expiry" : `${days} days`}
              </label>
            ))}
          </div>
          {open && <LiveAttemptsNote capabilityId={row.capabilityId} />}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleApprove} disabled={approving}>
            {approving ? "Approving..." : "Approve & Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
