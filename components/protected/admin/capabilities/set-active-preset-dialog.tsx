"use client"

import { useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
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
import { Check, Search, ShieldAlert, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { cn } from "cn"

interface Preset {
  id: number
  name: string
  status?: string | null
  questionCount?: number
}

interface SetActivePresetDialogProps {
  capabilityId: string
  currentPresetId: number | null
  presets: Preset[]
  trigger: React.ReactNode
  canManage?: boolean
}

export function SetActivePresetDialog({
  capabilityId,
  currentPresetId,
  presets,
  trigger,
  canManage = false,
}: SetActivePresetDialogProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  const isChanging = currentPresetId !== null
  const selectedPresetObj = presets.find((p) => p.id === selected)

  const filtered = presets.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setSelected(null)
      setSearch("")
    }
  }

  async function handleSave() {
    if (!selected || selected === currentPresetId) return

    if (selectedPresetObj && selectedPresetObj.questionCount === 0) {
      toast.add({
        title: "Preset Has No Questions",
        description: `"${selectedPresetObj.name}" cannot be set as active because it has no included questions. Please add questions first.`,
        type: "warning",
      })
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/active-preset`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId: selected }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to set active preset.")
        }

        toast.add({
          title: isChanging ? "Active Preset Changed" : "Active Preset Set",
          description: `"${selectedPresetObj?.name}" is now the active preset and is pending review and approval by an administrator.`,
          type: "success",
        })

        setOpen(false)
        router.refresh()
      } catch (error) {
        console.error("Failed to set active preset:", error)
        toast.add({
          title: "Action Failed",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
          type: "error",
        })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-1">
          <DialogTitle>
            {isChanging ? "Change Active Preset" : "Select Active Preset"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isChanging
              ? "Select a different preset to set as active for this capability."
              : "Select a preset to activate for this capability."}
          </DialogDescription>
        </DialogHeader>

        {/* Admin Approval Notice Callout */}
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 space-y-1">
          <div className="font-medium flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            Admin Approval Required
          </div>
          <p className="text-muted-foreground dark:text-amber-300/80 leading-relaxed">
            Setting this preset as active will automatically send a request to the administrator so they can check and approve it.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search presets..."
            className="pl-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Preset List */}
        <div className="max-h-64 overflow-y-auto divide-y rounded-md border">
          {presets.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No presets created yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No presets match your search.
            </div>
          ) : (
            filtered.map((p) => {
              const isCurrentActive = p.id === currentPresetId
              const isSelected = selected === p.id

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (!isCurrentActive) {
                      setSelected(p.id)
                      if (p.questionCount === 0) {
                        toast.add({
                          title: "Preset Has No Questions",
                          description: `"${p.name}" has no included questions. Please add questions before setting it as active.`,
                          type: "warning",
                        })
                      }
                    }
                  }}
                  disabled={isCurrentActive}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-2.5 transition-colors text-left",
                    isCurrentActive
                      ? "opacity-60 cursor-not-allowed bg-muted/20"
                      : isSelected
                      ? "bg-muted/70 hover:bg-muted"
                      : "hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {isCurrentActive && (
                      <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 rounded px-1.5 py-0.2 shrink-0">
                        Current Active
                      </span>
                    )}
                    {p.questionCount !== undefined && (
                      <span className={cn(
                        "text-[10px] font-medium rounded px-1.5 py-0.2 shrink-0 border",
                        p.questionCount === 0
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      )}>
                        {p.questionCount} {p.questionCount === 1 ? "question" : "questions"}
                      </span>
                    )}
                    {p.status === "approved" && !isCurrentActive && (
                      <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.2 shrink-0">
                        Approved
                      </span>
                    )}
                    {p.status === "pending_approval" && (
                      <span className="text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.2 shrink-0">
                        Pending Approval
                      </span>
                    )}
                    {p.status === "rejected" && (
                      <span className="text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/30 rounded px-1.5 py-0.2 shrink-0">
                        Rejected
                      </span>
                    )}
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              )
            })
          )}
        </div>

        {isChanging && presets.length <= 1 && (
          <p className="text-xs text-muted-foreground text-center">
            No other presets available to select. Create a new preset first to change the active preset.
          </p>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <DialogClose
            render={
              <Button variant="outline" type="button" disabled={isPending}>
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || selected === null || selected === currentPresetId}
          >
            {isPending
              ? "Setting Active Preset..."
              : canManage
              ? "Save Active Preset"
              : "Set as Active Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
