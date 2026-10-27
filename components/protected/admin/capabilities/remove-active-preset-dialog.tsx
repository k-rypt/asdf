"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, AlertCircle } from "lucide-react"
import { toast } from "@/components/ui/toast"

interface RemoveActivePresetDialogProps {
  capabilityId: string
  presetName: string
  trigger: React.ReactNode
}

export function RemoveActivePresetDialog({
  capabilityId,
  presetName,
  trigger,
}: RemoveActivePresetDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleRemove() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/active-preset`, {
          method: "DELETE",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to remove active preset.")
        }

        toast.add({
          title: "Active Preset Removed",
          description: `"${presetName}" is no longer active. This capability is now ineligible for assessments until an approved preset is set active.`,
          type: "success",
        })

        setOpen(false)
        router.refresh()
      } catch (err) {
        console.error("Failed to remove active preset:", err)
        toast.add({
          title: "Action Failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md rounded-none border border-border bg-card">
        <DialogHeader className="space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-none bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-semibold tracking-tight">
            Remove Active Preset
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-muted-foreground">
            Are you sure you want to remove <span className="font-medium text-foreground">"{presetName}"</span> as the active preset?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-xs space-y-2 font-mono">
          <div className="flex items-center gap-1.5 font-semibold text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Important Assessment Notice
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Removing this preset from being active will make this capability <strong className="text-foreground">ineligible or unusable for assessments</strong>.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            To make this capability eligible again, you must set a preset as active and wait for an administrator to approve it.
          </p>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
          <DialogClose
            render={
              <Button variant="outline" type="button" disabled={isPending} className="rounded-none text-xs h-8">
                Cancel
              </Button>
            }
          />
          <Button
            variant="destructive"
            type="button"
            onClick={handleRemove}
            disabled={isPending}
          >
            {isPending ? "Removing..." : "Remove Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
