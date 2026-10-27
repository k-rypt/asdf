"use client"

import { useState } from "react"
import { Loader2, Plus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SFIA_LEVEL_LABELS } from "@assessment-toolkit/core"
import type { LadderLevel } from "@/lib/assessment/ladder"

const SFIA_LEVEL_OPTIONS: { value: string; label: string }[] = Object.entries(SFIA_LEVEL_LABELS).map(
  ([level, label]) => ({ value: level, label: `SFIA ${level} -- ${label}` })
)

interface AddTierQuestionResult {
  id: string
  title: string
  sfiaLevel: number
  tierLabel: string
  tierId: number
  appliesTo: string | null
  passThreshold: number
  advanceMessage: string | null
  stayMessage: string | null
}

interface Props {
  assessmentId: number
  /** The capability's ladder -- decides whether the new-level fields are shown (the server only uses them when the ladder lacks the level), not which level can be picked. */
  ladder: LadderLevel[]
  onCreated: (result: AddTierQuestionResult) => void
}

/**
 * Manual counterpart to ManualQuestionForm, scoped to yes_no tier
 * questions -- posts to .../assessments/[assessmentId]/tier-questions
 * instead of .../capabilities/[capability]/questions, since a tier
 * question needs an assessment to attach its tier to. Defaults the SFIA
 * level to 2 (the low end of the SFIA 2-6 default range -- see
 * generateAssessmentFromJobDescription's tierRangeHint).
 */
export function AddTierQuestionDialog({ assessmentId, ladder, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [sfiaLevel, setSfiaLevel] = useState("2")
  const [label, setLabel] = useState("")
  const [appliesTo, setAppliesTo] = useState("")
  const [passThreshold, setPassThreshold] = useState("0.6")
  const [advanceMessage, setAdvanceMessage] = useState("")
  const [stayMessage, setStayMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentLevel = ladder.find((l) => l.sfiaLevel === Number(sfiaLevel)) ?? null
  const needsNewTier = currentLevel == null

  function reset() {
    setTitle("")
    setDescription("")
    setSfiaLevel("2")
    setLabel("")
    setAppliesTo("")
    setPassThreshold("0.6")
    setAdvanceMessage("")
    setStayMessage("")
    setError(null)
  }

  async function handleCreate() {
    if (loading) return
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.")
      return
    }
    if (needsNewTier && !label.trim()) {
      setError("Give this level a name -- the ladder has no level at this SFIA level yet.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/tier-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          sfiaLevel: Number(sfiaLevel),
          label: needsNewTier ? label : undefined,
          appliesTo: needsNewTier ? appliesTo.trim() || undefined : undefined,
          passThreshold: needsNewTier ? Number(passThreshold) : undefined,
          advanceMessage: needsNewTier ? advanceMessage.trim() || undefined : undefined,
          stayMessage: needsNewTier ? stayMessage.trim() || undefined : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create the tier question.")
      }
      onCreated(data as AddTierQuestionResult)
      setOpen(false)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the tier question.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        Add tier question
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add tier question</DialogTitle>
          <DialogDescription>
            Adds a yes/no question to this assessment&apos;s self-assessment ladder. If the
            capability&apos;s ladder already has the chosen SFIA level, the question uses it as-is;
            otherwise a new ladder level is created from the fields below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tier-question-sfia-level">SFIA level</Label>
            <Select value={sfiaLevel} onValueChange={(v) => setSfiaLevel(v ?? "2")} items={SFIA_LEVEL_OPTIONS}>
              <SelectTrigger id="tier-question-sfia-level" className="w-full" disabled={loading}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SFIA_LEVEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tier-question-title">Title</Label>
            <Input id="tier-question-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tier-question-description">Description (the yes/no prompt)</Label>
            <Textarea
              id="tier-question-description"
              className="min-h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {needsNewTier ? (
            <div className="flex flex-col gap-3 rounded-md border p-2">
              <p className="text-xs text-muted-foreground">
                The ladder has no level at this SFIA level yet -- it will be created with these fields.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tier-question-label" className="text-xs">Tier label</Label>
                <Input
                  id="tier-question-label"
                  placeholder="e.g. P3 -- Apply"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tier-question-applies-to" className="text-xs">Applies to (optional)</Label>
                <Input
                  id="tier-question-applies-to"
                  value={appliesTo}
                  onChange={(e) => setAppliesTo(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tier-question-pass-threshold" className="text-xs">Pass threshold (0-1)</Label>
                <Input
                  id="tier-question-pass-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={passThreshold}
                  onChange={(e) => setPassThreshold(e.target.value)}
                  disabled={loading}
                  className="w-24"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tier-question-advance-message" className="text-xs">Advance message (optional)</Label>
                <Input
                  id="tier-question-advance-message"
                  value={advanceMessage}
                  onChange={(e) => setAdvanceMessage(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tier-question-stay-message" className="text-xs">Stay message (optional)</Label>
                <Input
                  id="tier-question-stay-message"
                  value={stayMessage}
                  onChange={(e) => setStayMessage(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border p-3 text-xs">
              <p className="text-sm font-medium">
                {`${currentLevel.label} · moves up at ${Math.round(currentLevel.passThreshold * 100)}% yes`}
              </p>
              {currentLevel.appliesTo && <p>Applies to: {currentLevel.appliesTo}</p>}
              {currentLevel.advanceMessage && <p>Move-up message: {currentLevel.advanceMessage}</p>}
              {currentLevel.stayMessage && <p>Stay message: {currentLevel.stayMessage}</p>}
              <p className="text-muted-foreground">Edit levels in the Self-assessment ladder card.</p>
            </div>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading || !title.trim() || !description.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
