"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Target,
  FileText,
  AlertCircle,
  Check,
  BookOpen,
  Tag,
  Code,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ReviewChoice {
  id: number | string
  context: string
  isCorrect: boolean
}

export interface ReviewQuestion {
  id: string
  title: string
  description?: string | null
  type?: string | null
  status?: string | null
  sfiaLevel?: number | null
  bloomLevel?: string | null
  sampleInput?: string | null
  sampleOutput?: string | null
  constraints?: string | null
  starterCode?: string | null
  expectedConcepts?: string[] | null
  choices: ReviewChoice[]
}

export interface ApprovalRow {
  presetId: number
  presetName: string
  description?: string | null
  durationMinutes?: number | null
  passingScore?: number | null
  questionTypeMix?: Record<string, number> | null
  capabilityId: number
  capabilityName: string
  isPresetInUse: boolean
  note: string | null
  questionCount: number
  submittedByName: string
  submittedAt: string | null
  questions: ReviewQuestion[]
}

interface ReviewPresetDialogProps {
  row: ApprovalRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: () => void
  onReject: () => void
}

const sfiaLabels: Record<string, string> = {
  "1": "Follow",
  "2": "Assist",
  "3": "Apply",
  "4": "Enable",
  "5": "Ensure/Advise",
  "6": "Initiate/Influence",
  "7": "Set Strategy",
}

const bloomColours: Record<string, string> = {
  remember: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  understand: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  apply: "bg-green-500/10 text-green-500 border-green-500/20",
  analyze: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  evaluate: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  create: "bg-red-500/10 text-red-500 border-red-500/20",
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Unknown date"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ReviewPresetDialog({
  row,
  open,
  onOpenChange,
  onApprove,
  onReject,
}: ReviewPresetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {row.isPresetInUse && (
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold py-0.5"
              >
                Preset in Use
              </Badge>
            )}
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs py-0.5"
            >
              Pending Approval
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            {row.presetName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Capability:{" "}
            <span className="font-medium text-foreground">{row.capabilityName}</span>{" "}
            • Submitted by{" "}
            <span className="font-medium text-foreground">{row.submittedByName}</span>{" "}
            on {formatDate(row.submittedAt)}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Submitter Note / Request Callout */}
          {row.note && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-semibold text-primary">
                  Capability Owner Note:
                </span>
                <p className="text-foreground/90">{row.note}</p>
              </div>
            </div>
          )}

          {/* Preset Parameters Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>Duration</span>
              </div>
              <p className="text-sm font-semibold">
                {row.durationMinutes != null ? `${row.durationMinutes} mins` : "Not set"}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span>Passing Score</span>
              </div>
              <p className="text-sm font-semibold">
                {row.passingScore != null ? `${row.passingScore}%` : "Not set"}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>Total Questions</span>
              </div>
              <p className="text-sm font-semibold">
                {row.questions.length} {row.questions.length === 1 ? "question" : "questions"}
              </p>
            </div>
          </div>

          {/* Preset Description (if present) */}
          {row.description && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Preset Description
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {row.description}
              </p>
            </div>
          )}

          {/* Question Type Mix (if present) */}
          {row.questionTypeMix && Object.keys(row.questionTypeMix).length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Question Type Mix
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(row.questionTypeMix).map(([type, weight]) => (
                  <Badge key={type} variant="secondary" className="text-xs capitalize">
                    {type.replace(/_/g, " ")}: {weight}%
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Questions Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-semibold tracking-tight">
                Preset Questions ({row.questions.length})
              </h3>
              <span className="text-xs text-muted-foreground">
                Review questions and answers before approving
              </span>
            </div>

            {row.questions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                This preset does not contain any questions.
              </div>
            ) : (
              <div className="space-y-4">
                {row.questions.map((question, index) => {
                  const bloomColour = question.bloomLevel
                    ? bloomColours[question.bloomLevel.toLowerCase()] ?? "bg-muted text-muted-foreground"
                    : null

                  return (
                    <div
                      key={question.id}
                      className="rounded-lg border bg-card p-4 space-y-3 shadow-xs"
                    >
                      {/* Question Top Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            #{index + 1}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground capitalize">
                            {question.status ?? "Question"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {question.type && (
                            <Badge variant="outline" className="text-[11px] capitalize gap-1">
                              <BookOpen className="h-3 w-3" />
                              {question.type.replace(/_/g, " ")}
                            </Badge>
                          )}
                          {question.sfiaLevel && (
                            <Badge variant="outline" className="text-[11px]">
                              SFIA {question.sfiaLevel} —{" "}
                              {sfiaLabels[String(question.sfiaLevel)] ?? ""}
                            </Badge>
                          )}
                          {question.bloomLevel && (
                            <Badge className={`text-[11px] capitalize border ${bloomColour}`}>
                              Bloom: {question.bloomLevel}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Question Title & Description */}
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold leading-snug">
                          {question.title}
                        </h4>
                        {question.description && (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {question.description}
                          </p>
                        )}
                      </div>

                      {/* Expected Concepts */}
                      {question.expectedConcepts && question.expectedConcepts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {question.expectedConcepts.map((concept) => (
                            <Badge key={concept} variant="secondary" className="text-[10px] gap-1">
                              <Tag className="h-2.5 w-2.5" />
                              {concept}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Multiple Choice Options */}
                      {question.choices && question.choices.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Answer Choices
                          </p>
                          <div className="space-y-1.5">
                            {question.choices.map((choice, i) => (
                              <div
                                key={choice.id}
                                className={cn(
                                  "flex items-start gap-2.5 p-2.5 rounded-md border text-xs transition-colors",
                                  choice.isCorrect
                                    ? "bg-green-500/10 border-green-500/30 text-green-950 dark:text-green-200"
                                    : "bg-muted/20 border-border text-muted-foreground"
                                )}
                              >
                                <span className="font-semibold shrink-0 mt-0.5">
                                  {String.fromCharCode(65 + i)}.
                                </span>
                                <span className="flex-1 text-foreground/90 leading-relaxed">
                                  {choice.context}
                                </span>
                                {choice.isCorrect && (
                                  <span className="inline-flex items-center gap-1 shrink-0 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-500/20 px-2 py-0.5 rounded-full">
                                    <Check className="h-3 w-3 stroke-[3]" /> Correct
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Constraints & Starter Code / Sample for Coding Questions */}
                      {question.constraints && (
                        <div className="space-y-1 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground">Constraints</p>
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 p-2 rounded border">
                            {question.constraints}
                          </p>
                        </div>
                      )}

                      {question.starterCode && (
                        <div className="space-y-1 pt-1">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Code className="h-3 w-3" /> Starter Code
                          </p>
                          <pre className="text-xs font-mono bg-muted/50 p-2.5 rounded border overflow-x-auto">
                            {question.starterCode}
                          </pre>
                        </div>
                      )}

                      {(question.sampleInput || question.sampleOutput) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {question.sampleInput && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-muted-foreground">Sample Input</p>
                              <pre className="text-xs font-mono bg-muted/40 p-2 rounded border overflow-x-auto">
                                {question.sampleInput}
                              </pre>
                            </div>
                          )}
                          {question.sampleOutput && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-muted-foreground">Sample Output</p>
                              <pre className="text-xs font-mono bg-muted/40 p-2 rounded border overflow-x-auto">
                                {question.sampleOutput}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dialog Footer */}
        <DialogFooter className="p-4 px-6 border-t bg-muted/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              type="button"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={onReject}
            >
              Reject Preset
            </Button>
            <Button type="button" onClick={onApprove}>
              Approve &amp; Schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
