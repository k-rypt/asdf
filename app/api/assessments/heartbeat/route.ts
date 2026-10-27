import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const assessmentId = body?.assessmentId // attempts.id -- opaque, scoped by profile_id in the query below
  const assessmentDefinitionId = typeof body?.assessmentDefinitionId === "string" ? body.assessmentDefinitionId : undefined
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId is required." }, { status: 400 })
  }

  const ctx = await requireEmployeeAssessmentClient(assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    const result = await ctx.api.heartbeat(String(assessmentId), ctx.user.id, String(ctx.assessmentDefinitionId))
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
