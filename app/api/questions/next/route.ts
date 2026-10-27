import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const attemptedIds: string[] = Array.isArray(body?.attemptedIds) ? body.attemptedIds : []
  const results = Array.isArray(body?.results) ? body.results : undefined
  const assessmentDefinitionId = typeof body?.assessmentDefinitionId === "string" ? body.assessmentDefinitionId : undefined

  const ctx = await requireEmployeeAssessmentClient(assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    const question = await ctx.api.getNextQuestion(String(ctx.assessmentDefinitionId), attemptedIds, results)
    // createRestApiClient checks specifically for 204 to mean "no more questions".
    if (!question) return new NextResponse(null, { status: 204 })
    return NextResponse.json(question)
  } catch (err) {
    return toErrorResponse(err)
  }
}
