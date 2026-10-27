import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { AttemptAlreadyFinishedError } from "@/lib/assessment/supabase-assessment-api-client"

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assessmentDefinitionId = typeof body.assessmentDefinitionId === "string" ? body.assessmentDefinitionId : undefined

  const ctx = await requireEmployeeAssessmentClient(assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    const result = await ctx.api.startSession(ctx.user.id, String(ctx.assessmentDefinitionId))
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err, err instanceof AttemptAlreadyFinishedError ? 409 : 500)
  }
}
