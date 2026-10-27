"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface RejectDialogProps {
  row: { presetId: number; capabilityId: number; presetName: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onRejected: () => void
}

export function RejectDialog({ row, open, onOpenChange, onRejected }: RejectDialogProps) {
  const [note, setNote] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReject() {
    if (!note.trim()) {
      setError("A rejection reason is required.")
      return
    }
    setRejecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/capabilities/${row.capabilityId}/presets/${row.presetId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to reject preset.")
      onRejected()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject preset.")
    } finally {
      setRejecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject &quot;{row.presetName}&quot;</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <label htmlFor="reject-note" className="text-sm font-medium">
            Reason
          </label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what needs to change before this can be approved."
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
            {rejecting ? "Rejecting..." : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
