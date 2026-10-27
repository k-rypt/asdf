import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import type { AttemptDetail } from "@/lib/assessment/attempt-detail"

/**
 * Full per-question breakdown, read-only: no editing, no re-scoring.
 * "reviewer" (Manager/Capability-Owner) heads it with whose attempt it is;
 * "employee" is someone viewing their own results -- headed by the
 * capability, with the tier breakdown they saw on finishing, and without
 * the grader's chain of thought (never shown to employees).
 */
export function AttemptDetailView({
  detail,
  audience = "reviewer",
}: {
  detail: AttemptDetail
  audience?: "reviewer" | "employee"
}) {
  const forEmployee = audience === "employee"
  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <div>
        {forEmployee ? (
          <>
            <p className="text-muted-foreground text-sm">Your results</p>
            <h1 className="text-2xl font-bold tracking-tight">{detail.capabilityName}</h1>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{detail.profileName}</h1>
            <p className="text-muted-foreground text-sm">
              {detail.profileEmail} &middot; {detail.capabilityName}
            </p>
          </>
        )}
        <p className="text-muted-foreground text-sm mt-1">
          Completed {detail.completedAt ? formatDate(detail.completedAt, true) : "—"}
        </p>
      </div>

      {detail.tierResult && (
        <div className="rounded-md border p-4">
          <p className="font-medium">
            {detail.tierResult.achievedSfiaLevel > 0
              ? `Achieved: ${detail.tierResult.tiers.find((t) => t.sfiaLevel === detail.tierResult!.achievedSfiaLevel)?.label ?? "—"}`
              : "No tier achieved"}
          </p>
          {forEmployee && (
            <>
              {detail.tierResult.message && (
                <p className="mt-1 text-sm text-muted-foreground">{detail.tierResult.message}</p>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">Tier-by-tier breakdown</summary>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {detail.tierResult.tiers.map((t) => (
                    <li key={t.sfiaLevel} className="flex items-center justify-between">
                      <span>{t.label}</span>
                      <span className={t.passed ? "text-foreground" : "text-muted-foreground"}>
                        {t.yesCount}/{t.totalCount} {t.passed ? "passed" : "not passed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}

      {detail.answers.length === 0 ? (
        <p className="text-muted-foreground text-sm">No answer data recorded for this attempt.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {detail.answers.map((result) => (
            <Card key={result.questionId}>
              <CardHeader>
                <CardTitle>{result.questionTitle}</CardTitle>
                {result.displayLevel && <CardDescription>{result.displayLevel}</CardDescription>}
                {result.displayLevelDescription && (
                  <CardDescription>{result.displayLevelDescription}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {result.yesNoValue !== undefined ? (
                  <p>Answered: {result.yesNoValue ? "Yes" : "No"}</p>
                ) : (
                  <p>Score: {result.totalScore}</p>
                )}
                {result.rawAnswerDisplay?.kind === "choice" && (
                  <p className="text-sm">
                    Selected answer: {result.rawAnswerDisplay.text ?? <span className="text-muted-foreground">(choice no longer exists)</span>}
                  </p>
                )}
                {result.rawAnswerDisplay?.kind === "code" && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">Submitted code</summary>
                    <pre className="mt-1 rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap">
                      {result.rawAnswerDisplay.code}
                    </pre>
                    {result.rawAnswerDisplay.compilationOutput && (
                      <pre className="mt-1 rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap">
                        {result.rawAnswerDisplay.compilationOutput}
                      </pre>
                    )}
                  </details>
                )}
                {result.subScores && (
                  <div className="flex gap-2 flex-wrap text-xs text-muted-foreground">
                    <Badge variant="outline">Correctness {result.subScores.correctness}</Badge>
                    <Badge variant="outline">Quality {result.subScores.quality}</Badge>
                    <Badge variant="outline">Edge cases {result.subScores.edgeCases}</Badge>
                    <Badge variant="outline">Best practice {result.subScores.bestPractice}</Badge>
                  </div>
                )}
                {result.feedback && <p className="text-muted-foreground text-sm">{result.feedback}</p>}
                {result.sfiaLevelAssigned != null && (
                  <p className="text-sm text-muted-foreground">SFIA level assigned: {result.sfiaLevelAssigned}</p>
                )}
                {result.knowledgeGaps && result.knowledgeGaps.length > 0 && (
                  <div className="text-sm">
                    <p className="text-muted-foreground">Knowledge gaps:</p>
                    <ul className="list-disc list-inside">
                      {result.knowledgeGaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!forEmployee && result.chainOfThought && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">Chain of thought</summary>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{result.chainOfThought}</p>
                  </details>
                )}
                {result.annotatedCode && result.annotatedCode.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">Annotated code</summary>
                    <div className="mt-1 flex flex-col gap-2">
                      {result.annotatedCode.map((entry, i) => (
                        <div key={i} className="text-sm">
                          <pre className="rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap">
                            {entry.codeSnippet}
                          </pre>
                          <p className="text-muted-foreground mt-1">{entry.improvement}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {result.guides && result.guides.length > 0 && (
                  <div className="text-sm">
                    <p className="text-muted-foreground">Recommended study guides:</p>
                    <ul className="list-disc list-inside">
                      {result.guides.map((guide, i) => (
                        <li key={i}>
                          <a href={guide.url} target="_blank" rel="noreferrer" className="underline">
                            {guide.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
