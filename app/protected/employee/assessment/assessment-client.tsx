"use client"

import Link from "next/link"
import { createPyodideRunner, createRestApiClient } from "@assessment-toolkit/core"
import type { CodeRunnerRegistry, CompleteSessionResult, SubmissionResult } from "@assessment-toolkit/core"
import { AssessmentContainer } from "@assessment-toolkit/ui"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PYODIDE_BASE_URL, PYODIDE_WORKER_URL } from "@/lib/assessment/pyodide"

// Points at app/api/assessments|questions|compile|submissions -- see the
// wiring note on lib/assessment/supabase-assessment-api-client.ts. Created
// once at module scope; it's a plain fetch wrapper with no per-render state.
// An archived account gets 401 account_archived from the proxy on its next
// call (the heartbeat polls every 30s), so send them to the login page,
// where the proxy signs them out and the archived message shows.
const api = createRestApiClient("", {
  // A full page load, not router.push: the proxy must run to sign them out.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  onAccountArchived: () => window.location.assign("/auth/login?archived=1"),
})

// Run Code runners. Python runs in the employee's browser via self-hosted
// Pyodide (public/pyodide/<version>/, copied by scripts/copy-pyodide.mjs).
// Languages without an entry get no Run button.
const codeRunners: CodeRunnerRegistry = {
  python: createPyodideRunner({ workerURL: PYODIDE_WORKER_URL, indexURL: PYODIDE_BASE_URL }),
}

function FinalReport({ results, theta }: { results: SubmissionResult[]; theta: CompleteSessionResult | null }) {
  const graded = results.filter((r) => r.yesNoValue === undefined)
  const average =
    graded.length > 0 ? graded.reduce((sum, r) => sum + r.totalScore, 0) / graded.length : null

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Assessment complete</h1>
        {average !== null && (
          <p className="mt-1 text-muted-foreground">Average score: {average.toFixed(1)}</p>
        )}
      </div>
      {theta?.tierResult && (
        <div className="rounded-md border p-4">
          {(() => {
            const achieved = theta.tierResult.tiers.find(
              (t) => t.sfiaLevel === theta.tierResult!.achievedSfiaLevel
            )
            return (
              <>
                <p className="font-medium">
                  {achieved ? `Achieved: ${achieved.label}` : "No tier achieved yet"}
                </p>
                {theta.tierResult.message && (
                  <p className="mt-1 text-sm text-muted-foreground">{theta.tierResult.message}</p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Tier-by-tier breakdown
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {theta.tierResult.tiers.map((t) => (
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
            )
          })()}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {results.map((result) => (
          <Card key={result.questionId}>
            <CardHeader>
              <CardTitle>{result.questionTitle}</CardTitle>
              {result.displayLevel && <CardDescription>{result.displayLevel}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {result.yesNoValue !== undefined ? (
                <p>Answered: {result.yesNoValue ? "Yes" : "No"}</p>
              ) : (
                <p>Score: {result.totalScore}</p>
              )}
              {result.feedback && <p className="text-muted-foreground">{result.feedback}</p>}
              {result.sfiaLevelAssigned != null && (
                <p className="text-sm text-muted-foreground">SFIA level: {result.sfiaLevelAssigned}</p>
              )}
              {result.knowledgeGaps && result.knowledgeGaps.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p>Areas to work on:</p>
                  <ul className="ml-4 list-disc">
                    {result.knowledgeGaps.map((gap, i) => (
                      <li key={i}>{gap}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <Button
        render={<Link href="/protected/employee" />}
        nativeButton={false}
        variant="outline"
        className="self-start"
      >
        Back to dashboard
      </Button>
    </main>
  )
}

function LockedOut({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Assessment locked</h1>
        <p className="mt-2 text-muted-foreground">{reason}</p>
        <Button
          render={<Link href="/protected/employee" />}
          nativeButton={false}
          variant="outline"
          className="mt-4"
        >
          Back to dashboard
        </Button>
      </div>
    </main>
  )
}

export function AssessmentClient({
  userId,
  assessmentDefinitionId,
}: {
  userId: string
  assessmentDefinitionId: string
}) {
  return (
    <AssessmentContainer
      api={api}
      userId={userId}
      assessmentDefinitionId={assessmentDefinitionId}
      renderFinalReport={(results, theta) => <FinalReport results={results} theta={theta} />}
      renderLockedOut={(reason) => <LockedOut reason={reason} />}
      codeRunners={codeRunners}
    />
  )
}
