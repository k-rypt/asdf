"use client"

import { useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Loader2, Paperclip } from "lucide-react"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { QuestionKind } from "@/lib/assessment/ladder"

interface GeneratedQuestionSummary {
  id: string
  type: string
  title: string
  sfiaLevel: number | null
}

interface DroppedQuestionSummary {
  title: string
  reason: string
}

interface GenerateAssessmentResponse {
  assessmentId: number
  assessmentTitle?: string
  assessmentDescription?: string
  status: "draft"
  questions: GeneratedQuestionSummary[]
  droppedQuestions: DroppedQuestionSummary[]
  keptLadderLevels?: number[]
  missingLadderLevels?: number[]
}

interface Props {
  capabilityId: string
  kinds: QuestionKind[]
  onBack: () => void
  onClose: () => void
}

/**
 * AI step of AddQuestionsDialog -- drives
 * app/api/admin/capabilities/[capability]/generate-assessment, limited to the
 * question types picked in the previous step. Everything it creates lands as
 * `assessments.status = 'draft'` and
 * `questions.status = 'pending_review'` -- this form only drafts and
 * shows what was created; the "Review questions" button in the success
 * state hands off to the Review page
 * (components/protected/capabilities/assessment-review-view.tsx) for
 * editing/activating/making a preset.
 */
export function AiGenerateForm({ capabilityId, kinds, onBack, onClose }: Props) {
  const router = useRouter()
  // Mounted under both /protected/capability/... (owner) and
  // /protected/admin/capabilities/... (admin) via CapabilityTabs ->
  // CapabilityDetailView -- neither thread a basePath prop down here, so
  // the review link is derived from the current path instead of hardcoded.
  const pathname = usePathname()
  const basePath = pathname.startsWith("/protected/admin/capabilities")
    ? "/protected/admin/capabilities"
    : "/protected/capability"
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [jobDescription, setJobDescription] = useState("")
  const [questionCount, setQuestionCount] = useState("8")
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [additionalInstructions, setAdditionalInstructions] = useState("")
  const [sfiaLevelMin, setSfiaLevelMin] = useState("")
  const [sfiaLevelMax, setSfiaLevelMax] = useState("")
  const [passingScoreOverride, setPassingScoreOverride] = useState("")
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateAssessmentResponse | null>(null)

  function reset() {
    setJobDescription("")
    setQuestionCount("8")
    setOptionsOpen(false)
    setAdditionalInstructions("")
    setSfiaLevelMin("")
    setSfiaLevelMax("")
    setPassingScoreOverride("")
    setError(null)
    setResult(null)
  }

  function toOptionalInt(value: string): number | undefined {
    const parsed = Number(value)
    return value.trim() && Number.isFinite(parsed) ? parsed : undefined
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/parse-document", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to read that file.")
      }
      // Populate rather than replace-and-hide -- lets the owner review/edit
      // the extraction before generating, since a bad extraction should be
      // visible and fixable, not fed into the prompt blind.
      setJobDescription(data.text as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read that file.")
    } finally {
      setUploading(false)
    }
  }

  async function handleGenerate() {
    if (!jobDescription.trim() || loading) return
    const minLevel = toOptionalInt(sfiaLevelMin)
    const maxLevel = toOptionalInt(sfiaLevelMax)
    if (minLevel != null && maxLevel != null && minLevel > maxLevel) {
      setError("SFIA level minimum can't be greater than the maximum.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const parsedCount = Number(questionCount)
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/generate-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription,
          questionCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : undefined,
          allowedTypes: kinds,
          additionalInstructions: additionalInstructions.trim() || undefined,
          sfiaLevelMin: toOptionalInt(sfiaLevelMin),
          sfiaLevelMax: toOptionalInt(sfiaLevelMax),
          passingScoreOverride: toOptionalInt(passingScoreOverride),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to generate an assessment.")
      }
      setResult(data as GenerateAssessmentResponse)
      router.refresh() // so the new pending_review questions show up in the Questions tab underneath
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate an assessment.")
    } finally {
      setLoading(false)
    }
  }

  const keptLadderLevels = result?.keptLadderLevels ?? []
  const missingLadderLevels = result?.missingLadderLevels ?? []

  return (
    <>
      <DialogHeader>
        <DialogTitle>Generate assessment from job description</DialogTitle>
        <DialogDescription>
          Paste a job description. This drafts an assessment and a set of questions for this
          capability as a review draft -- nothing here reaches employees until it&apos;s promoted.
        </DialogDescription>
      </DialogHeader>

      {!result ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="job-description">Job description</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.pdf,.md,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={loading || uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Reading..." : "Upload .docx / .pdf / .md"}
                </Button>
              </div>
              <Textarea
                id="job-description"
                placeholder="Paste the job description here, or upload a file above..."
                className="min-h-40"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                disabled={loading || uploading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-count">Approximate number of questions (max 25)</Label>
              <Input
                id="question-count"
                type="number"
                min={1}
                max={25}
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                disabled={loading}
                className="w-24"
              />
            </div>

            <div className="flex flex-col gap-2 rounded-md border p-2">
              <button
                type="button"
                className="flex items-center justify-between text-xs font-medium"
                onClick={() => setOptionsOpen((v) => !v)}
              >
                Options
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
              </button>
              {optionsOpen && (
                <div className="flex flex-col gap-3 pt-1">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="additional-instructions" className="text-xs">
                      Additional instructions for the AI (optional)
                    </Label>
                    <Textarea
                      id="additional-instructions"
                      placeholder="e.g. paste an existing ladder (like P1–P5 with its questions) and ask the AI to use those exact questions and levels..."
                      className="min-h-20 text-xs"
                      value={additionalInstructions}
                      onChange={(e) => setAdditionalInstructions(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="sfia-min" className="text-xs">SFIA level min</Label>
                      <Input
                        id="sfia-min"
                        type="number"
                        min={1}
                        max={7}
                        placeholder="1"
                        value={sfiaLevelMin}
                        onChange={(e) => setSfiaLevelMin(e.target.value)}
                        disabled={loading}
                        className="w-20"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="sfia-max" className="text-xs">SFIA level max</Label>
                      <Input
                        id="sfia-max"
                        type="number"
                        min={1}
                        max={7}
                        placeholder="7"
                        value={sfiaLevelMax}
                        onChange={(e) => setSfiaLevelMax(e.target.value)}
                        disabled={loading}
                        className="w-20"
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="passing-score-override" className="text-xs">Passing score override</Label>
                      <Input
                        id="passing-score-override"
                        type="number"
                        min={0}
                        max={100}
                        placeholder="AI-suggested"
                        value={passingScoreOverride}
                        onChange={(e) => setPassingScoreOverride(e.target.value)}
                        disabled={loading}
                        className="w-28"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onBack} disabled={loading}>
              Back
            </Button>
            <Button onClick={handleGenerate} disabled={loading || !jobDescription.trim()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <p className="text-xs">
              Drafted <strong>{result.questions.length}</strong> question
              {result.questions.length === 1 ? "" : "s"} into a new draft assessment.
            </p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto rounded-md border p-2">
              {result.questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-2 text-xs min-w-0">
                  <span className="truncate min-w-0">{q.title}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="capitalize">
                      {q.type.replace("_", " ")}
                    </Badge>
                    {q.sfiaLevel != null && <Badge variant="secondary">SFIA {q.sfiaLevel}</Badge>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Each one is saved as <strong>pending review</strong>.
            </p>
            {keptLadderLevels.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {`Kept your existing ladder settings for ${keptLadderLevels.map((l) => `SFIA ${l}`).join(", ")}.`}
              </p>
            )}
            {missingLadderLevels.length > 0 && (
              <p className="text-xs text-amber-600">
                {missingLadderLevels.map((l) => `SFIA ${l}`).join(", ")}{" "}
                {missingLadderLevels.length === 1 ? "has" : "have"} no ladder settings yet -- set{" "}
                {missingLadderLevels.length === 1 ? "it" : "them"} up in the Self-assessment ladder card before
                those questions count.
              </p>
            )}
            {result.droppedQuestions.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                <p className="text-xs font-medium">
                  {result.droppedQuestions.length} question
                  {result.droppedQuestions.length === 1 ? "" : "s"} the model drafted{" "}
                  {result.droppedQuestions.length === 1 ? "was" : "were"} dropped before saving:
                </p>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {result.droppedQuestions.map((d, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{d.title}</span>
                      <span className="text-muted-foreground"> -- {d.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={reset}>
              Generate another
            </Button>
            <Button
              onClick={() => {
                onClose()
                const ids = result.questions.map((q) => q.id).join(",")
                router.push(
                  `${basePath}/${capabilityId}/assessments/${result.assessmentId}/review?ids=${encodeURIComponent(ids)}`
                )
              }}
            >
              Review questions
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  )
}
