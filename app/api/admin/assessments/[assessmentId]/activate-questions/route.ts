import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

interface RouteParams {
  params: Promise<{ assessmentId: string }>
}

/**
 * "Set All Questions Active" from the Review page -- promotes every
 * question linked to this assessment from pending_review to active.
 * Idempotent: only touches rows still pending_review, so re-running it
 * (or running it on a batch that's already partly active) is a no-op for
 * the ones already active rather than an error.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const { assessmentId } = await params
  const ctx = await requireCapabilityManager({ assessmentId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx


  try {
    const { data: links, error: linksError } = await supabase
      .from("assessment_questions")
      .select("question_id")
      .eq("assessment_id", assessmentId)
    if (linksError) throw new Error(`Failed to load linked questions: ${linksError.message}`)

    const questionIds = (links ?? []).map((l) => l.question_id as string)
    if (questionIds.length === 0) {
      return NextResponse.json({ activated: 0 })
    }

    const { data: activated, error: updateError } = await supabase
      .from("questions")
      .update({ status: "active" })
      .in("id", questionIds)
      .eq("status", "pending_review")
      .select("id")
    if (updateError) throw new Error(`Failed to activate questions: ${updateError.message}`)

    return NextResponse.json({ activated: activated?.length ?? 0 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
