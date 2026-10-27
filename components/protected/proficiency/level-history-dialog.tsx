"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDate } from "@/lib/utils"
import type { LevelResult } from "@/lib/assessment/proficiency"

/** The current-level badge; clicking it lists every past ladder result. */
export function LevelHistoryDialog({
  title,
  current,
  history,
  showAsOf,
}: {
  title: string
  current: LevelResult
  history: LevelResult[]
  showAsOf: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="flex flex-col items-start gap-0.5" onClick={() => setOpen(true)}>
        <Badge variant="outline">{current.label}</Badge>
        {showAsOf && <span className="text-[11px] text-muted-foreground">as of {formatDate(current.completedAt)}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Every finished self-assessment, newest first.</DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-2 text-sm">
            {history.map((h) => (
              <li key={h.attemptId} className="flex flex-col gap-0.5 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{h.label}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(h.completedAt)}</span>
                </div>
                <span className="text-xs text-muted-foreground">{h.assessmentName}</span>
                {h.message && <span className="text-xs">{h.message}</span>}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
