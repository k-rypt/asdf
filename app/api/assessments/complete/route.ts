import { NextResponse } from "next/server"
import type { SubmissionResult } from "@assessment-toolkit/core"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

interface CompleteBody {
  assessmentId?: string
  assessmentDefinitionId?: string
  results?: SubmissionResult[]
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CompleteBody | null
  if (!body?.assessmentId || !Array.isArray(body.results)) {
    return NextResponse.json({ error: "assessmentId and results are required." }, { status: 400 })
  }

  const ctx = await requireEmployeeAssessmentClient(body.assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    const result = await ctx.api.completeSession(
      String(body.assessmentId),
      ctx.user.id,
      body.results,
      String(ctx.assessmentDefinitionId)
    )
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
