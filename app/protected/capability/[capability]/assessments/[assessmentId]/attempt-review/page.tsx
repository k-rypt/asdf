import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { loadAttemptDetail } from "@/lib/assessment/attempt-detail"
import { findReviewAttemptId } from "@/lib/assessment/find-review-attempt"
import { AttemptDetailView } from "@/components/protected/assessment-review/attempt-detail-view"

interface PageProps {
  params: Promise<{ capability: string; assessmentId: string }>
  searchParams: Promise<{ profileId?: string; attemptId?: string }>
}

/**
 * Capability-scoped counterpart to the manager route -- same
 * assessment-definition-id-to-real-attempt-id resolution, same shared
 * loadAttemptDetail/AttemptDetailView. CapabilityLayout already gates this
 * whole subtree to capability owners; loadAttemptDetail's `capabilityId`
 * option additionally narrows to *this* capability specifically, since
 * the existing "admin or capability owner" RLS policy is role-based, not
 * per-capability (see loadAttemptDetail's doc comment).
 *
 * 2026-10-10: lives at .../assessments/[assessmentId]/attempt-review
 * (not .../review) because the sibling
 * .../assessments/[assessmentId]/review/page.tsx already owns that leaf
 * path for a different feature (AssessmentReviewView's question-content
 * review). The two used to sit in separate [assessmentId] / [attemptId]
 * sibling folders -- same directory position, different dynamic segment
 * names -- which Next.js's app router rejects outright ("Failed reload
 * dynamic routes: You cannot use different slug names for the same
 * dynamic path"), breaking dynamic routing app-wide, not just here. See
 * manager-dashboard-client.tsx's detailHrefSuffix prop for the other half
 * of this fix.
 */
export default async function CapabilityAttemptReviewPage({ params, searchParams }: PageProps) {
  const { capability: capabilityIdParam, assessmentId: assessmentDefinitionIdParam } = await params
  const { profileId, attemptId } = await searchParams
  const capabilityId = Number(capabilityIdParam)

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

  const detail = await loadAttemptDetail(supabase, reviewAttemptId, { capabilityId })

  if (detail === "error") {
    return <p className="p-6 text-destructive">Something went wrong loading this attempt. Please try again.</p>
  }
  if (detail === "not_found") {
    return <p className="p-6 text-muted-foreground">Attempt not found, or you don&apos;t have access to it.</p>
  }

  return <AttemptDetailView detail={detail} />
}
