"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { CustomizePresetDialog } from "./customize-preset-dialog"
import { AddTierQuestionDialog } from "./add-tier-question-dialog"
import type { LadderLevel } from "@/lib/assessment/ladder"
import { LiveAttemptsNote } from "@/components/protected/admin/live-attempts-note"

/**
 * Local-timezone `YYYY-MM-DD`, matching what `<input type="date">` reads
 * and writes. `toISOString().slice(0, 10)` would use UTC instead, which
 * is off by a day for anyone west of UTC in the evening -- e.g. 11pm PDT
 * is already "tomorrow" in UTC, so the Publish form would default to a
 * start date the admin hasn't reached yet.
 */
function todayDateInputValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export interface ReviewQuestion {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  sfiaLevel: number | null
  choices: { id: number | string; context: string; isCorrect: boolean }[]
}

export interface ReviewTier {
  id: number
  sfiaLevel: number
  label: string
  appliesTo: string | null
  passThreshold: number
  advanceMessage: string | null
  stayMessage: string | null
}

interface Props {
  backHref: string
  capabilityId: string
  assessmentId: number
  assessmentName: string | null
  durationMinutes: number | null
  passingScore: number | null
  initialQuestions: ReviewQuestion[]
  tiers: ReviewTier[]
  /** The capability's ladder (capability_ladder_levels), not this assessment's copy. */
  ladder: LadderLevel[]
  /** Admin-only -- see AssessmentReviewView's canPublish doc comment. */
  canPublish?: boolean
}

export function AssessmentReviewClient({
  backHref,
  capabilityId,
  assessmentId,
  assessmentName,
  initialQuestions,
  tiers: initialTiers,
  ladder: initialLadder,
  canPublish = false,
}: Props) {
  const router = useRouter()
  const [questions, setQuestions] = useState(initialQuestions)
  const [tiers, setTiers] = useState(initialTiers)
  const [ladder, setLadder] = useState(initialLadder)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedTierId, setExpandedTierId] = useState<number | null>(null)
  const [setActive, setSetActive] = useState(false)
  const [makePreset, setMakePreset] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presetDialogOpen, setPresetDialogOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [durationDays, setDurationDays] = useState<number | null>(14)
  const [availableFrom, setAvailableFrom] = useState(todayDateInputValue())
  const [publishing, setPublishing] = useState(false)

  // Publish is disabled until every question in the batch is `active` --
  // either it already was, or this visit's "Set All Questions Active"
  // (setActive) will make it so once Confirm is clicked below.
  const allActive = questions.length > 0 && questions.every((q) => q.status === "active")

  function onMakePresetChange(checked: boolean) {
    setMakePreset(checked)
    if (checked) setSetActive(true) // a preset can't be built on non-active questions
  }

  async function removeQuestion(questionId: string) {
    const res = await fetch(`/api/admin/questions/${questionId}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? "Failed to remove question.")
      return
    }
    setQuestions((qs) => qs.filter((q) => q.id !== questionId))
  }

  async function saveQuestionEdit(questionId: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? "Failed to save edit.")
      return false
    }
    // Sync local state with what was just saved -- without this, a second
    // edit (e.g. marking a different choice correct) rebuilds its payload
    // from stale `q.choices`/`q.title` and silently reverts the first edit.
    setQuestions((qs) =>
      qs.map((q) => (q.id === questionId ? { ...q, ...(patch as Partial<ReviewQuestion>) } : q))
    )
    return true
  }

  async function saveTierEdit(tierId: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/assessments/${assessmentId}/tiers/${tierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? "Failed to save tier edit.")
      return false
    }
    // Merge the server's normalized response (trimmed/null-coerced
    // appliesTo/advanceMessage/stayMessage), not the raw request patch --
    // otherwise local state keeps an untrimmed/pre-normalization value
    // that silently diverges from what's actually in the DB.
    // The server re-copies the tier from the capability ladder; the id
    // normally stays the same, but we take whatever id it returns.
    const updated = (await res.json()) as ReviewTier
    setTiers((ts) => ts.map((t) => (t.id === tierId ? { ...t, ...updated } : t)))
    return true
  }

  async function handlePublish() {
    if (publishing) return
    setPublishing(true)
    setError(null)
    try {
      if (!allActive) {
        const res = await fetch(`/api/admin/assessments/${assessmentId}/activate-questions`, {
          method: "POST",
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? "Failed to activate questions.")
        }
      }
      const res = await fetch(`/api/admin/assessments/${assessmentId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationDays, availableFrom }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "Failed to publish assessment.")
      }
      router.push(backHref)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setPublishing(false)
    }
  }

  async function handleContinue() {
    if (questions.length === 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      if (setActive) {
        const res = await fetch(`/api/admin/assessments/${assessmentId}/activate-questions`, {
          method: "POST",
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? "Failed to activate questions.")
        }
      }

      if (!makePreset) {
        if (setActive) {
          router.push(
            `/protected/capability/${capabilityId}/questions/pool?preselect=${questions
              .map((q) => q.id)
              .join(",")}`
          )
        } else {
          router.push(backHref)
        }
      }

      if (makePreset) {
        setPresetDialogOpen(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  const gradedQuestions = questions.filter((q) => q.type !== "yes_no")
  const tierQuestionsByLevel = new Map<number, ReviewQuestion[]>()
  for (const q of questions) {
    if (q.type !== "yes_no" || q.sfiaLevel == null) continue
    const list = tierQuestionsByLevel.get(q.sfiaLevel) ?? []
    list.push(q)
    tierQuestionsByLevel.set(q.sfiaLevel, list)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Capability
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review: {assessmentName ?? "Untitled assessment"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {gradedQuestions.length} question{gradedQuestions.length === 1 ? "" : "s"} in this batch.
        </p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-2 rounded-md border p-2">
        {gradedQuestions.map((q) => (
          <Card key={q.id} className="shrink-0">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                >
                  <p className="text-sm font-medium">{q.title}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="outline" className="capitalize text-xs">{q.type.replace("_", " ")}</Badge>
                    <Badge variant="secondary" className="text-xs capitalize">{q.status}</Badge>
                    {q.sfiaLevel != null && <Badge variant="outline" className="text-xs">SFIA {q.sfiaLevel}</Badge>}
                  </div>
                </button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                  <TooltipContent>Remove question from batch</TooltipContent>
                </Tooltip>
              </div>

              {expandedId === q.id && (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                  <Input
                    defaultValue={q.title}
                    onBlur={(e) => e.target.value !== q.title && saveQuestionEdit(q.id, { title: e.target.value })}
                  />
                  <Textarea
                    defaultValue={q.description ?? ""}
                    className="min-h-20 text-sm"
                    onBlur={(e) =>
                      e.target.value !== q.description && saveQuestionEdit(q.id, { description: e.target.value })
                    }
                  />
                  {q.choices.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {q.choices.map((c) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            defaultChecked={c.isCorrect}
                            onChange={() =>
                              saveQuestionEdit(q.id, {
                                choices: q.choices.map((other) => ({
                                  id: other.id,
                                  context: other.context,
                                  isCorrect: other.id === c.id,
                                })),
                              })
                            }
                          />
                          <Input
                            defaultValue={c.context}
                            className="text-sm"
                            onBlur={(e) =>
                              e.target.value !== c.context &&
                              saveQuestionEdit(q.id, {
                                choices: q.choices.map((other) => ({
                                  id: other.id,
                                  context: other.id === c.id ? e.target.value : other.context,
                                  isCorrect: other.isCorrect,
                                })),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {questions.length === 0 && (
          <p className="text-center text-muted-foreground text-sm p-8">
            This assessment has no questions -- they may have been deleted from the question pool.
            Delete this assessment or regenerate it from the capability page.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Self-assessment ladder</p>
          <AddTierQuestionDialog
            assessmentId={assessmentId}
            ladder={ladder}
            onCreated={(result) => {
              if (!ladder.some((l) => l.sfiaLevel === result.sfiaLevel)) {
                setLadder((ls) =>
                  [
                    ...ls,
                    {
                      sfiaLevel: result.sfiaLevel,
                      label: result.tierLabel,
                      appliesTo: result.appliesTo,
                      passThreshold: result.passThreshold,
                      advanceMessage: result.advanceMessage,
                      stayMessage: result.stayMessage,
                    },
                  ].sort((a, b) => a.sfiaLevel - b.sfiaLevel)
                )
              }
              setQuestions((qs) => [
                ...qs,
                {
                  id: result.id,
                  type: "yes_no",
                  title: result.title,
                  description: null,
                  status: "pending_review",
                  sfiaLevel: result.sfiaLevel,
                  choices: [],
                },
              ])
              if (!tiers.some((t) => t.sfiaLevel === result.sfiaLevel)) {
                setTiers((ts) => [
                  ...ts,
                  {
                    id: result.tierId,
                    sfiaLevel: result.sfiaLevel,
                    label: result.tierLabel,
                    appliesTo: result.appliesTo,
                    passThreshold: result.passThreshold,
                    advanceMessage: result.advanceMessage,
                    stayMessage: result.stayMessage,
                  },
                ])
              }
            }}
          />
        </div>

        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tiers on this assessment yet.</p>
        ) : (
          [...tiers]
            .sort((a, b) => a.sfiaLevel - b.sfiaLevel)
            .map((tier) => (
              <Card key={tier.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{tier.label}</p>
                      {tier.appliesTo && <p className="text-xs text-muted-foreground">{tier.appliesTo}</p>}
                      <Badge variant="outline" className="mt-1 text-xs">
                        SFIA {tier.sfiaLevel} · {Math.round(tier.passThreshold * 100)}% to advance
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedTierId(expandedTierId === tier.id ? null : tier.id)}
                    >
                      {expandedTierId === tier.id ? "Close" : "Edit tier"}
                    </Button>
                  </div>

                  {expandedTierId === tier.id && (
                    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                      <Input
                        defaultValue={tier.label}
                        onBlur={(e) => e.target.value !== tier.label && saveTierEdit(tier.id, { label: e.target.value })}
                      />
                      <Input
                        defaultValue={tier.appliesTo ?? ""}
                        placeholder="Applies to"
                        onBlur={(e) =>
                          e.target.value !== (tier.appliesTo ?? "") && saveTierEdit(tier.id, { appliesTo: e.target.value })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        defaultValue={tier.passThreshold}
                        onBlur={(e) =>
                          Number(e.target.value) !== tier.passThreshold &&
                          saveTierEdit(tier.id, { passThreshold: Number(e.target.value) })
                        }
                        className="w-24"
                      />
                      <Input
                        defaultValue={tier.advanceMessage ?? ""}
                        placeholder="Advance message"
                        onBlur={(e) =>
                          e.target.value !== (tier.advanceMessage ?? "") &&
                          saveTierEdit(tier.id, { advanceMessage: e.target.value })
                        }
                      />
                      <Input
                        defaultValue={tier.stayMessage ?? ""}
                        placeholder="Stay message"
                        onBlur={(e) =>
                          e.target.value !== (tier.stayMessage ?? "") &&
                          saveTierEdit(tier.id, { stayMessage: e.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                    {(tierQuestionsByLevel.get(tier.sfiaLevel) ?? []).map((q) => (
                      <div key={q.id} className="flex items-center justify-between gap-2">
                        <p className="text-sm">{q.title}</p>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            }
                          />
                          <TooltipContent>Remove question</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                    {(tierQuestionsByLevel.get(tier.sfiaLevel) ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No questions at this tier yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={setActive} onCheckedChange={(c) => setSetActive(Boolean(c))} disabled={makePreset} />
          Set All Questions Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={makePreset} onCheckedChange={(c) => onMakePresetChange(Boolean(c))} />
          Make Preset
        </label>
        <div className="flex justify-end">
          <Button onClick={handleContinue} disabled={questions.length === 0 || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>

      {canPublish && (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Publish</p>
              <p className="text-xs text-muted-foreground">
                Makes this assessment visible to employees on this capability.
              </p>
            </div>
            <Button
              variant={publishOpen ? "outline" : "default"}
              onClick={() => setPublishOpen((v) => !v)}
              disabled={questions.length === 0 || !(allActive || setActive) || publishing}
            >
              Publish
            </Button>
          </div>
          {publishOpen && (
            <div className="flex flex-col gap-3 border-t pt-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="publish-start-date" className="text-sm font-medium">
                  Start date
                </label>
                <input
                  id="publish-start-date"
                  type="date"
                  className="w-40 rounded-md border px-2 py-1.5 text-sm"
                  value={availableFrom}
                  min={todayDateInputValue()}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to today (available immediately on publish).
                </p>
              </div>
              <p className="text-sm font-medium">Available for</p>
              <div className="flex flex-col gap-1.5">
                {([7, 14, 30, null] as const).map((days) => (
                  <label key={String(days)} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="publish-duration"
                      checked={durationDays === days}
                      onChange={() => setDurationDays(days)}
                    />
                    {days == null ? "No expiry" : `${days} days`}
                  </label>
                ))}
              </div>
              <LiveAttemptsNote capabilityId={capabilityId} />
              <div className="flex justify-end">
                <Button onClick={handlePublish} disabled={publishing}>
                  {publishing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Publish
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <CustomizePresetDialog
        open={presetDialogOpen}
        onOpenChange={setPresetDialogOpen}
        capabilityId={capabilityId}
        questionIds={questions.map((q) => q.id)}
        defaultName={assessmentName ?? undefined}
        onSaved={() => setPresetDialogOpen(false)}
      />
    </div>
  )
}
