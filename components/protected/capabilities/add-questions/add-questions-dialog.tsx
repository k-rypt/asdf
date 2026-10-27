"use client"

import { useState } from "react"
import { PenLine, Plus, Sparkles } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { QUESTION_KINDS, isKindDisabled, type LadderLevel, type QuestionKind } from "@/lib/assessment/ladder"
import { ManualQuestionForm } from "./manual-question-form"
import { AiGenerateForm } from "./ai-generate-form"

type Step = "how" | "types" | "manual" | "ai"

/**
 * One entry point for adding questions to a capability: manual or AI first,
 * then the question types (the Yes/No ladder can't be mixed with graded
 * types), then the matching form.
 */
export function AddQuestionsDialog({ capabilityId, ladder }: { capabilityId: string; ladder: LadderLevel[] }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("how")
  const [mode, setMode] = useState<"manual" | "ai">("manual")
  const [kinds, setKinds] = useState<Set<QuestionKind>>(new Set())

  function reset() {
    setStep("how")
    setKinds(new Set())
  }

  function toggle(kind: QuestionKind) {
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const ordered = QUESTION_KINDS.map((k) => k.value).filter((k) => kinds.has(k))
  // Base UI only calls onOpenChange for its own close gestures, so closing
  // from a form's Done / Review button has to reset the steps itself.
  const close = () => {
    setOpen(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        Add questions
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {step === "how" && (
          <>
            <DialogHeader>
              <DialogTitle>Add questions</DialogTitle>
              <DialogDescription>How do you want to add questions?</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  { value: "manual", icon: PenLine, title: "Create manually", hint: "Write each question yourself." },
                  { value: "ai", icon: Sparkles, title: "Generate with AI", hint: "Draft a set from a job description." },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="flex flex-col items-start gap-1 rounded-md border p-4 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setMode(o.value)
                    setStep("types")
                  }}
                >
                  <o.icon className="h-5 w-5" />
                  <span className="font-medium">{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "types" && (
          <>
            <DialogHeader>
              <DialogTitle>Which question types?</DialogTitle>
              <DialogDescription>
                {mode === "manual" ? "You can switch between the types you tick while adding." : "The AI only drafts these types."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {QUESTION_KINDS.map((k) => {
                const disabled = isKindDisabled(kinds, k.value)
                return (
                  <label
                    key={k.value}
                    className={`flex items-center gap-2 text-sm ${disabled ? "text-muted-foreground" : ""}`}
                    title={disabled ? "Ladder questions can't be mixed with graded questions" : undefined}
                  >
                    <Checkbox checked={kinds.has(k.value)} disabled={disabled} onCheckedChange={() => toggle(k.value)} />
                    {k.label}
                    {disabled && (
                      <span className="text-xs">
                        {k.value === "yes_no" ? "(can't be mixed with graded questions)" : "(can't be mixed with the ladder)"}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("how")}>
                Back
              </Button>
              <Button disabled={kinds.size === 0} onClick={() => setStep(mode)}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "manual" && (
          <ManualQuestionForm
            capabilityId={capabilityId}
            kinds={ordered}
            ladder={ladder}
            onBack={() => setStep("types")}
            onClose={close}
          />
        )}
        {step === "ai" && (
          <AiGenerateForm capabilityId={capabilityId} kinds={ordered} onBack={() => setStep("types")} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  )
}
