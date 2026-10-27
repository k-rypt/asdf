import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const assessmentId = body?.assessmentId
  const reason = body?.reason
  const assessmentDefinitionId = typeof body?.assessmentDefinitionId === "string" ? body.assessmentDefinitionId : undefined
  if (!assessmentId || !reason) {
    return NextResponse.json({ error: "assessmentId and reason are required." }, { status: 400 })
  }

  const ctx = await requireEmployeeAssessmentClient(assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    await ctx.api.invalidateSession(String(assessmentId), ctx.user.id, String(reason), String(ctx.assessmentDefinitionId))
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
