"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  capabilityId: string
  questionIds: string[]
  defaultName?: string
  defaultPassingScore?: number | null
  /** Called after a successful save with the new preset's id. */
  onSaved: (presetId: number) => void
}

/**
 * Save-only for now (Part 1) -- Part 2 adds a second "Save & Submit for
 * Approval" button alongside "Save Preset" here.
 */
export function CustomizePresetDialog({
  open,
  onOpenChange,
  capabilityId,
  questionIds,
  defaultName,
  defaultPassingScore,
  onSaved,
}: Props) {
  const router = useRouter()
  // Mounted from both the capability-owner and admin trees (via
  // assessment-review-client and question-pool-client, both dual-mounted
  // the same way add-questions/ai-generate-form.tsx is) -- derive the redirect
  // from the current route rather than hardcoding the owner tree.
  const pathname = usePathname()
  const basePath = pathname.startsWith("/protected/admin/capabilities")
    ? "/protected/admin/capabilities"
    : "/protected/capability"
  const [name, setName] = useState(defaultName ?? "")
  const [description, setDescription] = useState("")
  const [passingScore, setPassingScore] = useState(
    defaultPassingScore != null ? String(defaultPassingScore) : ""
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          passingScore: passingScore.trim() ? Number(passingScore) : undefined,
          questionIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to save preset.")
      onSaved(data.presetId)
      router.push(`${basePath}/${capabilityId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize preset</DialogTitle>
          <DialogDescription>
            Saves {questionIds.length} question{questionIds.length === 1 ? "" : "s"} as a reusable
            template for this capability.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-name">Name</Label>
            <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preset-description">Description (optional)</Label>
            <Textarea
              id="preset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              className="min-h-16 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preset-passing-score">Passing score</Label>
              <Input
                id="preset-passing-score"
                type="number"
                min={0}
                max={100}
                value={passingScore}
                onChange={(e) => setPassingScore(e.target.value)}
                disabled={saving}
                className="w-28"
              />
            </div>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
