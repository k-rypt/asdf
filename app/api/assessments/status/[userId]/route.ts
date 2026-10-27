import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

// The [userId] segment exists only to match assessment-toolkit's
// createRestApiClient, which fetches `/api/assessments/status/${userId}` --
// it's never read here. Identity comes from the session cookie, not the URL
// (see requireEmployeeAssessmentClient).
export async function GET(request: Request) {
  const assessmentDefinitionId = new URL(request.url).searchParams.get("assessmentDefinitionId") ?? undefined

  const ctx = await requireEmployeeAssessmentClient(assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    const status = await ctx.api.getStatus(ctx.user.id, String(ctx.assessmentDefinitionId))
    return NextResponse.json(status)
  } catch (err) {
    return toErrorResponse(err)
  }
}
