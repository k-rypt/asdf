"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import type { LadderLevel } from "@/lib/assessment/ladder"

type LevelRow = LadderLevel & { questionCount: number }

interface Draft {
  sfiaLevel: string
  label: string
  appliesTo: string
  threshold: string
  advanceMessage: string
  stayMessage: string
}

const toDraft = (l: LadderLevel | null, nextLevel: number): Draft => ({
  sfiaLevel: String(l?.sfiaLevel ?? nextLevel),
  label: l?.label ?? "",
  appliesTo: l?.appliesTo ?? "",
  threshold: String(Math.round((l?.passThreshold ?? 0.6) * 100)),
  advanceMessage: l?.advanceMessage ?? "",
  stayMessage: l?.stayMessage ?? "",
})

/** The capability's one ladder: everyone climbs from the lowest level until they say no to most at one. */
export function LadderCard({ capabilityId }: { capabilityId: string }) {
  const router = useRouter()
  const [levels, setLevels] = useState<LevelRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ isNew: boolean; draft: Draft } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<LevelRow | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/ladder`)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? "Failed to load the ladder.")
        return
      }
      setError(null)
      setLevels(data.levels as LevelRow[])
    } catch {
      setError("Failed to load the ladder.")
    }
  }, [capabilityId])

  useEffect(() => {
    // Initial fetch: setState only runs in the promise callback, not in the effect body.
    void Promise.resolve().then(load)
  }, [load])

  const used = new Set((levels ?? []).map((l) => l.sfiaLevel))
  const nextFree = [1, 2, 3, 4, 5, 6, 7].find((n) => !used.has(n)) ?? 7
  // Steps are the levels that exist, in SFIA order. Unused SFIA numbers are
  // not gaps -- the climb goes straight from one step to the next.
  const sorted = [...(levels ?? [])].sort((a, b) => a.sfiaLevel - b.sfiaLevel)

  // Client-side checks for the edit dialog; the server still validates.
  function validate(): { sfia: string | null; threshold: string | null; name: string | null } {
    const none = { sfia: null, threshold: null, name: null }
    if (!editing) return none
    const d = editing.draft
    const sfiaNum = Number(d.sfiaLevel)
    let sfia: string | null = null
    if (editing.isNew) {
      if (d.sfiaLevel.trim() === "" || !Number.isInteger(sfiaNum) || sfiaNum < 1 || sfiaNum > 7) {
        sfia = "SFIA level must be a whole number from 1 to 7."
      } else if (used.has(sfiaNum)) {
        sfia = `SFIA ${sfiaNum} already has a level — edit it instead.`
      }
    }
    const t = Number(d.threshold)
    const threshold =
      d.threshold.trim() === "" || !Number.isInteger(t) || t < 0 || t > 100 ? "Enter a whole number from 0 to 100." : null
    const name = d.label.trim() ? null : "Name is required."
    return { sfia, threshold, name }
  }
  const problems = validate()
  const invalid = Boolean(problems.sfia || problems.threshold || problems.name)

  async function save() {
    if (!editing || invalid) return
    setSaving(true)
    let failed: number[] = []
    try {
      const d = editing.draft
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/ladder/${d.sfiaLevel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: d.label,
          appliesTo: d.appliesTo,
          passThreshold: Number(d.threshold) / 100,
          advanceMessage: d.advanceMessage,
          stayMessage: d.stayMessage,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Failed to save the level.")
      failed = data?.failedAssessmentIds ?? []
    } catch (err) {
      toast.add({ title: "Save failed", description: err instanceof Error ? err.message : String(err), type: "error" })
      setSaving(false)
      return
    }
    // The PUT succeeded. Reload failures surface through load's own error state.
    setEditing(null)
    setSaving(false)
    if (failed.length > 0) {
      toast.add({
        title: "Level saved, some drafts not updated",
        description: `The level was saved but ${failed.length} draft assessment${failed.length === 1 ? "" : "s"} couldn't be updated. Try saving again.`,
        type: "warning",
      })
    }
    await load()
    router.refresh()
  }

  async function confirmRemove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/ladder/${deleting.sfiaLevel}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete the level.")
    } catch (err) {
      toast.add({ title: "Can't delete", description: err instanceof Error ? err.message : String(err), type: "error" })
      setDeleteBusy(false)
      return
    }
    setDeleting(null)
    setDeleteBusy(false)
    await load()
    router.refresh()
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEditing((cur) => (cur ? { ...cur, draft: { ...cur.draft, [key]: e.target.value } } : cur))

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Self-assessment ladder</p>
          <p className="text-xs text-muted-foreground">Everyone starts at the lowest level and climbs while they say yes to most.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditing({ isNew: true, draft: toDraft(null, nextFree) })} disabled={used.size >= 7}>
          <Plus className="h-4 w-4" />
          Add level
        </Button>
      </div>

      {error && <p className="text-destructive text-xs">{error}</p>}
      {levels === null && !error && <p className="text-xs text-muted-foreground">Loading ladder…</p>}
      {levels?.length === 0 && <p className="text-xs text-muted-foreground">No levels yet. Add one, or add a Yes/No ladder question.</p>}
      {sorted.map((l, i) => (
        <div key={l.sfiaLevel} className="flex items-start justify-between gap-2 rounded-md bg-muted/40 p-2 text-xs">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-sm">
              <span className="text-muted-foreground font-normal">Step {i + 1} · </span>
              {l.label}
            </span>
            <span className="text-muted-foreground">
              SFIA {l.sfiaLevel} · moves up at {Math.round(l.passThreshold * 100)}% yes · {l.questionCount} question
              {l.questionCount === 1 ? "" : "s"}
            </span>
            {l.appliesTo && <span>Applies to: {l.appliesTo}</span>}
            {l.advanceMessage && <span>Moves up: {l.advanceMessage}</span>}
            {l.stayMessage && <span>Stays: {l.stayMessage}</span>}
          </div>
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${l.label}`} onClick={() => setEditing({ isNew: false, draft: toDraft(l, l.sfiaLevel) })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {l.questionCount === 0 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${l.label}`} onClick={() => setDeleting(l)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.isNew ? "Add level" : "Edit level"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ladder-level">SFIA level</Label>
                  <Input id="ladder-level" type="number" min={1} max={7} value={editing.draft.sfiaLevel} onChange={set("sfiaLevel")} disabled={!editing.isNew} aria-invalid={Boolean(problems.sfia)} />
                  {problems.sfia && <p className="text-destructive text-xs">{problems.sfia}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ladder-threshold">Moves up at (% yes)</Label>
                  <Input id="ladder-threshold" type="number" min={0} max={100} value={editing.draft.threshold} onChange={set("threshold")} aria-invalid={Boolean(problems.threshold)} />
                  {problems.threshold && <p className="text-destructive text-xs">{problems.threshold}</p>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ladder-label">Name</Label>
                <Input id="ladder-label" placeholder="P1 – Beginner / Follow" value={editing.draft.label} onChange={set("label")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ladder-applies">Applies to (optional)</Label>
                <Input id="ladder-applies" placeholder="Junior Web Developer" value={editing.draft.appliesTo} onChange={set("appliesTo")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ladder-advance">Move-up message (optional)</Label>
                <Textarea id="ladder-advance" className="min-h-14" placeholder="Proceed to P2" value={editing.draft.advanceMessage} onChange={set("advanceMessage")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ladder-stay">Stay message (optional)</Label>
                <Textarea id="ladder-stay" className="min-h-14" placeholder="Stay at P1 or recommend foundational training" value={editing.draft.stayMessage} onChange={set("stayMessage")} />
              </div>
              {!editing.isNew && (
                <p className="text-xs text-muted-foreground">Changes apply to this capability&apos;s draft assessments. Published ones keep their levels.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
            <Button onClick={save} disabled={saving || invalid}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This level has no questions. Draft assessments won&apos;t change.</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={deleteBusy}>Cancel</Button>} />
            <Button variant="destructive" onClick={confirmRemove} disabled={deleteBusy}>
              {deleteBusy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
