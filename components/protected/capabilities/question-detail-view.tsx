import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { ArrowLeft, Tag, BarChart3, Users, Award, Clock, ListChecks, FileQuestion, CheckSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IRTCurve } from "./irt-curve"

// SFIA level labels
const sfiaLabels: Record<string, string> = {
  "1": "Follow",
  "2": "Assist",
  "3": "Apply",
  "4": "Enable",
  "5": "Ensure/Advise",
  "6": "Initiate/Influence",
  "7": "Set Strategy",
}

// IRT discrimination label
function discriminationLabel(a: number): { label: string; colour: string } {
  if (a < 0.5) return { label: "Low", colour: "bg-red-500/10 text-red-500 border-red-500/20" }
  if (a < 1.0) return { label: "Moderate", colour: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" }
  if (a < 2.0) return { label: "High", colour: "bg-green-500/10 text-green-500 border-green-500/20" }
  return { label: "Very High", colour: "bg-blue-500/10 text-blue-500 border-blue-500/20" }
}

/**
 * Shared question detail view, rendered under both
 * app/protected/admin/capabilities/[capability]/[question] and
 * app/protected/capability/[capability]/[question]. `backHref` is the only
 * bit that differs between the two mounts, so it's a prop instead of a
 * hardcoded /protected/admin/... link.
 */
export async function QuestionDetailView({
  questionId,
  backHref,
}: {
  questionId: string
  backHref: string
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const [
    { data: question, error: qErr },
    { data: answers },
    { data: choices },
  ] = await Promise.all([
    supabase.from("questions").select("*").eq("id", questionId).single(),
    supabase.from("attempt_answers").select("*").eq("question_id", questionId),
    supabase.from("question_choices").select("*").eq("question_id", questionId),
  ])

  if (qErr || !question) return notFound()

  // --- Compute stats from attempt_answers ---
  const totalAttempts = answers?.length ?? 0
  const avgScore = totalAttempts > 0
    ? (answers!.reduce((sum, a) => sum + (Number(a.total_score) || 0), 0) / totalAttempts).toFixed(2)
    : "N/A"
  const avgTimeSpent = totalAttempts > 0
    ? Math.round(answers!.reduce((sum, a) => sum + (Number(a.time_spent) || 0), 0) / totalAttempts)
    : null

  // Average sub-scores
  const subScores = totalAttempts > 0
    ? {
        correctness: (answers!.reduce((s, a) => s + (Number(a.score_correctness) || 0), 0) / totalAttempts).toFixed(2),
        efficiency: (answers!.reduce((s, a) => s + (Number(a.score_efficiency) || 0), 0) / totalAttempts).toFixed(2),
        quality: (answers!.reduce((s, a) => s + (Number(a.score_quality) || 0), 0) / totalAttempts).toFixed(2),
        best_practice: (answers!.reduce((s, a) => s + (Number(a.score_best_practice) || 0), 0) / totalAttempts).toFixed(2),
        edge_case: (answers!.reduce((s, a) => s + (Number(a.score_edge_case) || 0), 0) / totalAttempts).toFixed(2),
      }
    : null

  const disc = question.irt_a != null ? discriminationLabel(Number(question.irt_a)) : null

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-8">

      {/* Back + header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <a
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Capability
          </a>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{question.title}</h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {question.sfia_level && (
                <div className="rounded-none border border-border overflow-hidden inline-flex flex-col font-mono text-xs shadow-xs">
                  <div className="bg-card text-muted-foreground font-semibold text-[10px] text-left uppercase py-0.5 px-2 border-b border-border">
                    SFIA
                  </div>
                  <div className="flex items-stretch divide-x divide-border">
                    <div className="bg-primary text-primary-foreground font-bold px-2.5 py-0.5 text-xs flex items-center justify-center">
                      {question.sfia_level}
                    </div>
                    <div className="bg-card text-foreground px-2.5 py-0.5 text-xs font-medium flex items-center justify-center whitespace-nowrap">
                      {sfiaLabels[String(question.sfia_level)] ?? "N/A"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Classification row */}
        <div className="flex flex-wrap gap-2 items-center">
          {question.type && (
            <Badge variant="outline" className="capitalize rounded-none font-mono">
              {question.type.replace(/_/g, " ")}
            </Badge>
          )}
          {question.bloom_level && (
            <Badge variant="outline" className="capitalize rounded-none font-mono">
              Bloom: {question.bloom_level}
            </Badge>
          )}
        </div>

        {/* Tags section */}
        {Array.isArray(question.tags) && (question.tags as string[]).length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-xs font-medium text-muted-foreground font-mono">
              tags
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(question.tags as string[]).map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 rounded-none font-mono text-xs">
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Attempts */}
        <div className="rounded-none border border-border bg-card overflow-hidden font-mono shadow-xs flex flex-col justify-between">
          <div className="bg-muted/30 border-b border-border px-3.5 py-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Total Attempts
            </span>
            <Users className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-3.5">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {totalAttempts}
            </div>
          </div>
        </div>

        {/* Avg. Total Score */}
        <div className="rounded-none border border-border bg-card overflow-hidden font-mono shadow-xs flex flex-col justify-between">
          <div className="bg-muted/30 border-b border-border px-3.5 py-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Avg. Total Score
            </span>
            <Award className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-3.5">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {avgScore}
            </div>
          </div>
        </div>

        {/* Avg. Time Spent */}
        <div className="rounded-none border border-border bg-card overflow-hidden font-mono shadow-xs flex flex-col justify-between">
          <div className="bg-muted/30 border-b border-border px-3.5 py-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Avg. Time Spent
            </span>
            <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-3.5">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {avgTimeSpent != null ? `${avgTimeSpent}s` : "N/A"}
            </div>
          </div>
        </div>

        {/* Choices */}
        <div className="rounded-none border border-border bg-card overflow-hidden font-mono shadow-xs flex flex-col justify-between">
          <div className="bg-muted/30 border-b border-border px-3.5 py-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Choices
            </span>
            <ListChecks className="h-3.5 w-3.5 text-muted-foreground/60" />
          </div>
          <div className="p-3.5">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {choices?.length ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-scores breakdown */}
      {subScores && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Average Sub-Score Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {Object.entries(subScores).map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{key.replace("_", " ")}</span>
                  <span className="font-medium font-mono">{val}</span>
                </div>
                <div className="h-2 rounded-none bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-none transition-all"
                    style={{ width: `${Math.min(parseFloat(val) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* IRT Analysis */}
      {question.calibration_method === "classical" && question.irt_a != null && Array.isArray(question.irt_b_thresholds) && question.irt_b_thresholds.length > 0 && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                IRT Psychometric Profile — Provisional (classical, n={question.calibration_n ?? 0})
              </CardTitle>
              {disc && (
                <Badge className={`border rounded-none font-mono ${disc.colour}`}>
                  Discrimination: {disc.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Graded Response Model — shows the probability of achieving each scoring threshold at a given ability level (θ).
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <IRTCurve irt_a={Number(question.irt_a)} irt_b_thresholds={question.irt_b_thresholds.map(Number)} />
          </CardContent>
        </Card>
      )}

      {/* Expected Concepts */}
      {Array.isArray(question.expected_concepts) && question.expected_concepts.length > 0 && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold">Expected Concepts</CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-wrap gap-2">
            {(question.expected_concepts as string[]).map((concept) => (
              <Badge key={concept} variant="secondary" className="rounded-none font-mono text-xs">{concept}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Question content */}
      <div className="grid md:grid-cols-2 gap-4">
        {question.sample_input && (
          <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
            <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
              <CardTitle className="text-sm font-semibold">Sample Input</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <pre className="text-sm font-mono bg-muted rounded-none p-3 overflow-x-auto">{question.sample_input}</pre>
            </CardContent>
          </Card>
        )}
        {question.sample_output && (
          <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
            <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
              <CardTitle className="text-sm font-semibold">Sample Output</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <pre className="text-sm font-mono bg-muted rounded-none p-3 overflow-x-auto">{question.sample_output}</pre>
            </CardContent>
          </Card>
        )}
      </div>

      {question.constraints && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold">Constraints</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{question.constraints}</p>
          </CardContent>
        </Card>
      )}

      {question.starter_code && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold">Starter Code</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <pre className="text-sm font-mono bg-muted rounded-none p-3 overflow-x-auto">{question.starter_code}</pre>
          </CardContent>
        </Card>
      )}

      {/* Question statement */}
      {question.description && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-muted-foreground" />
              Question
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{question.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Multiple choice options */}
      {choices && choices.length > 0 && (
        <Card className="rounded-none border border-border bg-card overflow-hidden shadow-xs">
          <CardHeader className="border-b border-border bg-muted/20 py-2.5 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Answer Choices
              </CardTitle>
              <Badge variant="outline" className="rounded-none font-mono text-xs">
                {choices.length} {choices.length === 1 ? "Option" : "Options"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {choices.map((choice, i) => (
              <div
                key={choice.id}
                className={`flex items-start gap-3 p-3 rounded-none border ${
                  choice.is_correct
                    ? "bg-green-500/5 border-green-500/30"
                    : "bg-muted/20 border-border"
                }`}
              >
                <span className="mt-0.5 text-sm font-bold text-muted-foreground shrink-0 font-mono">
                  {String.fromCharCode(65 + i)}.
                </span>
                <p className="text-sm flex-1">{choice.context}</p>
                {choice.is_correct && (
                  <Badge className="ml-auto shrink-0 bg-green-500/10 text-green-500 border-green-500/20 rounded-none font-mono text-xs">Correct</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
