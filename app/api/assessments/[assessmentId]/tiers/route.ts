import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

// The [assessmentId] URL segment IS `assessments.id` (the static
// definition) -- see the ID mapping note on
// supabase-assessment-api-client.ts. Passed explicitly to
// requireEmployeeAssessmentClient, same as every other route below,
// rather than left implicit: this employee's capability/window checks
// run against *this* assessment, never whichever one a no-id
// resolution might otherwise guess.
export async function GET(_request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params
  const ctx = await requireEmployeeAssessmentClient(assessmentId)
  if (!ctx.ok) return ctx.response

  try {
    const tiers = await ctx.api.getTiers(String(ctx.assessmentDefinitionId))
    return NextResponse.json(tiers)
  } catch (err) {
    return toErrorResponse(err)
  }
}
