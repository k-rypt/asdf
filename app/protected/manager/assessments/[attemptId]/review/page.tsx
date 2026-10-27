import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { loadAttemptDetail } from "@/lib/assessment/attempt-detail"
import { findReviewAttemptId } from "@/lib/assessment/find-review-attempt"
import { AttemptDetailView } from "@/components/protected/assessment-review/attempt-detail-view"

interface PageProps {
  params: Promise<{ attemptId: string }>
  searchParams: Promise<{ profileId?: string; attemptId?: string }>
}

/**
 * [attemptId] in the URL is actually the assessment *definition* id --
 * see manager-dashboard-client.tsx's "View details" link comment. This
 * page resolves the real attempt id (the completed attempt for this
 * assessment + profileId) before loading detail, so the shared loader
 * still receives a true attempts.id.
 *
 * No separate role check here -- app/protected/manager/layout.tsx already
 * gates this whole subtree to managers. Scoping to *this manager's own*
 * reports is enforced by RLS (the 2026-10-02 migration's manager SELECT
 * policy on attempt_answers, plus the existing one on attempts) -- a
 * manager querying an attempt outside their reports simply gets zero rows
 * back, which loadAttemptDetail already renders as "not found".
 */
export default async function ManagerAttemptReviewPage({ params, searchParams }: PageProps) {
  const { attemptId: assessmentDefinitionIdParam } = await params
  const { profileId, attemptId } = await searchParams

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  if (!profileId) {
    return <p className="p-6 text-muted-foreground">Missing profile reference.</p>
  }

  const reviewAttemptId = await findReviewAttemptId(supabase, {
    assessmentId: Number(assessmentDefinitionIdParam),
    profileId,
    attemptId,
  })

  if (reviewAttemptId === null) {
    return <p className="p-6 text-muted-foreground">No completed attempt found.</p>
  }

  const detail = await loadAttemptDetail(supabase, reviewAttemptId)

  if (detail === "error") {
    return <p className="p-6 text-destructive">Something went wrong loading this attempt. Please try again.</p>
  }
  if (detail === "not_found") {
    return <p className="p-6 text-muted-foreground">Attempt not found, or you don&apos;t have access to it.</p>
  }

  return <AttemptDetailView detail={detail} />
}
