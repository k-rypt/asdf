"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { QUESTION_KINDS, type LadderLevel, type QuestionKind } from "@/lib/assessment/ladder"

interface Choice {
  id: string
  context: string
  isCorrect: boolean
}

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- same requirement as every
// other <Select> in this codebase, hence the `items` prop on each one.
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "csharp", label: "C#" },
  { value: "html_css", label: "HTML/CSS" },
]

const SFIA_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

function emptyChoice(): Choice {
  return { id: crypto.randomUUID(), context: "", isCorrect: false }
}

function initialChoices(type: QuestionKind): Choice[] {
  if (type === "true_false") {
    return [
      { id: crypto.randomUUID(), context: "True", isCorrect: true },
      { id: crypto.randomUUID(), context: "False", isCorrect: false },
    ]
  }
  return [emptyChoice(), emptyChoice()]
}

interface CreateQuestionResponse {
  id: string
  type: QuestionKind
  title: string
  sfiaLevel: number | null
  bloomLevel: string | null
  classificationFailed: boolean
  level: LadderLevel | null
  levelCreated: boolean
}

interface Props {
  capabilityId: string
  kinds: QuestionKind[]
  ladder: LadderLevel[]
  onBack: () => void
  onClose: () => void
}

/**
 * Manual step of AddQuestionsDialog -- posts to
 * app/api/admin/capabilities/[capability]/questions. For graded types, SFIA
 * level and Bloom level are deliberately NOT fields here -- the route infers
 * both via classifyQuestionSkillLevel right after insert. For yes/no ladder
 * questions the owner picks the SFIA level, and sets up that level on the
 * capability ladder the first time it's used. Everything lands as
 * `pending_review`/`source: 'manual'`; the form stays open after each save so
 * several questions can be added in a row.
 */
export function ManualQuestionForm({ capabilityId, kinds, ladder, onBack, onClose }: Props) {
  const router = useRouter()
  const [type, setType] = useState<QuestionKind>(kinds[0])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [choices, setChoices] = useState<Choice[]>(() => initialChoices(kinds[0]))
  const [constraints, setConstraints] = useState("")
  const [language, setLanguage] = useState("")
  const [starterCode, setStarterCode] = useState("")
  const [sampleInput, setSampleInput] = useState("")
  const [sampleOutput, setSampleOutput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<CreateQuestionResponse | null>(null)

  const [levels, setLevels] = useState<LadderLevel[]>(ladder)
  const [sfiaLevel, setSfiaLevel] = useState<string>(ladder[0] ? String(ladder[0].sfiaLevel) : "1")
  const [levelLabel, setLevelLabel] = useState("")
  const [levelAppliesTo, setLevelAppliesTo] = useState("")
  const [levelThreshold, setLevelThreshold] = useState("60")
  const [levelAdvance, setLevelAdvance] = useState("")
  const [levelStay, setLevelStay] = useState("")
  const [addedCount, setAddedCount] = useState(0)
  const currentLevel = levels.find((l) => String(l.sfiaLevel) === sfiaLevel) ?? null

  const sortedLevels = [...levels].sort((a, b) => a.sfiaLevel - b.sfiaLevel)
  const levelOptions: { value: string; label: string }[] = [
    ...sortedLevels.map((level) => ({
      value: String(level.sfiaLevel),
      label: `${level.label} (SFIA ${level.sfiaLevel})`,
    })),
    ...SFIA_NUMBERS.filter((n) => !levels.some((l) => l.sfiaLevel === n)).map((n) => ({
      value: String(n),
      label: `New level at SFIA ${n}`,
    })),
  ]

  function clearQuestionFields() {
    setTitle("")
    setDescription("")
    setChoices(initialChoices(type))
    setConstraints("")
    setLanguage("")
    setStarterCode("")
    setSampleInput("")
    setSampleOutput("")
    setLevelLabel("")
    setLevelAppliesTo("")
    setLevelThreshold("60")
    setLevelAdvance("")
    setLevelStay("")
  }

  function handleTypeChange(next: QuestionKind) {
    setType(next)
    if (next === "true_false") {
      setChoices(initialChoices("true_false"))
    } else if (next === "multiple_choice" && choices.length < 2) {
      setChoices([emptyChoice(), emptyChoice()])
    }
  }

  function updateChoiceText(id: string, context: string) {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, context } : c)))
  }

  function setCorrectChoice(id: string) {
    setChoices((prev) => prev.map((c) => ({ ...c, isCorrect: c.id === id })))
  }

  function addChoice() {
    setChoices((prev) => [...prev, emptyChoice()])
  }

  function removeChoice(id: string) {
    setChoices((prev) => (prev.length <= 2 ? prev : prev.filter((c) => c.id !== id)))
  }

  function validate(): string | null {
    if (type === "yes_no") {
      if (!title.trim()) return "Write the question."
      if (!currentLevel) {
        if (!levelLabel.trim()) return 'Give this level a name, e.g. "P1 – Beginner / Follow".'
        const threshold = Number(levelThreshold)
        if (!levelThreshold.trim() || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
          return "Pass threshold must be between 0% and 100%."
        }
      }
      return null
    }
    if (!title.trim() || !description.trim()) return "Title and description are required."
    if (type === "multiple_choice" || type === "true_false") {
      if (choices.length < 2 || choices.some((c) => !c.context.trim())) {
        return "At least two non-empty choices are required."
      }
      if (choices.filter((c) => c.isCorrect).length !== 1) {
        return "Exactly one choice must be marked correct."
      }
    }
    return null
  }

  async function handleCreate() {
    if (loading) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const body =
        type === "yes_no"
          ? {
              type,
              title,
              sfiaLevel: Number(sfiaLevel),
              level: currentLevel
                ? undefined
                : {
                    label: levelLabel,
                    appliesTo: levelAppliesTo,
                    passThreshold: Number(levelThreshold) / 100,
                    advanceMessage: levelAdvance,
                    stayMessage: levelStay,
                  },
            }
          : {
              type,
              title,
              description,
              constraints: type === "code_snippet" ? constraints.trim() || undefined : undefined,
              language: type === "code_snippet" ? language || undefined : undefined,
              starterCode: type === "code_snippet" ? starterCode.trim() || undefined : undefined,
              sampleInput: type === "code_snippet" ? sampleInput.trim() || undefined : undefined,
              sampleOutput: type === "code_snippet" ? sampleOutput.trim() || undefined : undefined,
              choices:
                type === "multiple_choice" || type === "true_false"
                  ? choices.map((c) => ({ context: c.context, isCorrect: c.isCorrect }))
                  : undefined,
            }
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create the question.")
      }
      const created = data as CreateQuestionResponse
      if (created.levelCreated && created.level) {
        const newLevel = created.level
        setLevels((prev) => [...prev, newLevel])
      }
      setLast(created)
      setAddedCount((c) => c + 1)
      clearQuestionFields()
      router.refresh() // so the new pending_review question shows up in the Questions tab underneath
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the question.")
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = type === "yes_no" ? !!title.trim() : !!title.trim() && !!description.trim()

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create questions</DialogTitle>
        <DialogDescription>
          {type === "yes_no" ? (
            <>You choose the SFIA level. Nothing reaches employees until it&apos;s reviewed.</>
          ) : (
            <>
              Author a question by hand. SFIA level and Bloom level are classified automatically after
              you create it -- nothing here reaches employees until it&apos;s reviewed and promoted.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {kinds.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Question type">
            {QUESTION_KINDS.filter((k) => kinds.includes(k.value)).map((k) => (
              <Button
                key={k.value}
                type="button"
                size="sm"
                variant={type === k.value ? "default" : "outline"}
                role="tab"
                aria-selected={type === k.value}
                onClick={() => handleTypeChange(k.value)}
                disabled={loading}
              >
                {k.label}
              </Button>
            ))}
          </div>
        )}

        {type === "yes_no" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-level">Level</Label>
              <Select value={sfiaLevel} onValueChange={(v) => setSfiaLevel(v ?? sfiaLevel)} items={levelOptions}>
                <SelectTrigger id="question-level" className="w-full" disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-title">Question</Label>
              <Textarea
                id="question-title"
                className="min-h-16"
                placeholder="e.g. Can you create a basic HTML page structure?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
            </div>

            {!currentLevel ? (
              <div className="flex flex-col gap-3 rounded-md border p-3">
                <p className="text-sm font-medium">Set up this level</p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level-label" className="text-xs">Name</Label>
                  <Input
                    id="level-label"
                    placeholder="P1 – Beginner / Follow"
                    value={levelLabel}
                    onChange={(e) => setLevelLabel(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level-applies-to" className="text-xs">Applies to (optional)</Label>
                  <Input
                    id="level-applies-to"
                    value={levelAppliesTo}
                    onChange={(e) => setLevelAppliesTo(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level-threshold" className="text-xs">Pass threshold (% yes to move up)</Label>
                  <Input
                    id="level-threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={levelThreshold}
                    onChange={(e) => setLevelThreshold(e.target.value)}
                    disabled={loading}
                    className="w-24"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level-advance" className="text-xs">Move-up message (optional)</Label>
                  <Textarea
                    id="level-advance"
                    className="min-h-14 text-xs"
                    value={levelAdvance}
                    onChange={(e) => setLevelAdvance(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level-stay" className="text-xs">Stay message (optional)</Label>
                  <Textarea
                    id="level-stay"
                    className="min-h-14 text-xs"
                    value={levelStay}
                    onChange={(e) => setLevelStay(e.target.value)}
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
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-title">Title</Label>
              <Input id="question-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-description">Description</Label>
              <Textarea
                id="question-description"
                className="min-h-24"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
          </>
        )}

        {(type === "multiple_choice" || type === "true_false") && (
          <div className="flex flex-col gap-1.5">
            <Label>Choices</Label>
            <div className="flex flex-col gap-2">
              {choices.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-choice"
                    checked={c.isCorrect}
                    onChange={() => setCorrectChoice(c.id)}
                    disabled={loading}
                  />
                  <Input
                    value={c.context}
                    onChange={(e) => updateChoiceText(c.id, e.target.value)}
                    disabled={loading || type === "true_false"}
                    className="text-sm"
                  />
                  {type === "multiple_choice" && choices.length > 2 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeChoice(c.id)} disabled={loading}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {type === "multiple_choice" && (
              <Button type="button" variant="outline" size="sm" onClick={addChoice} disabled={loading}>
                Add choice
              </Button>
            )}
          </div>
        )}

        {type === "code_snippet" && (
          <div className="flex flex-col gap-3 rounded-md border p-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-language" className="text-xs">Language (optional)</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v ?? "")} items={LANGUAGE_OPTIONS}>
                <SelectTrigger id="question-language" className="w-full" disabled={loading}>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-constraints" className="text-xs">Constraints (optional)</Label>
              <Textarea
                id="question-constraints"
                className="min-h-16 text-xs"
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-starter-code" className="text-xs">Starter code (optional)</Label>
              <Textarea
                id="question-starter-code"
                className="min-h-20 text-xs font-mono"
                value={starterCode}
                onChange={(e) => setStarterCode(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="question-sample-input" className="text-xs">Sample input (optional)</Label>
                <Textarea
                  id="question-sample-input"
                  className="min-h-16 text-xs font-mono"
                  value={sampleInput}
                  onChange={(e) => setSampleInput(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="question-sample-output" className="text-xs">Sample output (optional)</Label>
                <Textarea
                  id="question-sample-output"
                  className="min-h-16 text-xs font-mono"
                  value={sampleOutput}
                  onChange={(e) => setSampleOutput(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-destructive text-xs">{error}</p>}

        {addedCount > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            <p className="font-medium">Added this session: {addedCount}</p>
            {last &&
              (last.classificationFailed ? (
                <p className="text-amber-600">
                  &ldquo;{last.title}&rdquo; was created as <strong>pending review</strong>, but automatic SFIA/Bloom
                  classification failed -- set both manually from the question&apos;s edit page.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  &ldquo;{last.title}&rdquo; saved as <strong>pending review</strong>
                  {last.sfiaLevel != null ? ` at SFIA ${last.sfiaLevel}` : ""}.
                </p>
              ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
        <Button onClick={handleCreate} disabled={loading || !canSubmit}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Adding..." : "Add question"}
        </Button>
      </DialogFooter>
    </>
  )
}
