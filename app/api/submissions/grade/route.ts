import { NextResponse } from "next/server"
import type { Answer, Question } from "@assessment-toolkit/core"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

interface GradeBody {
  question?: Question
  answer?: Answer
  timeSpentSeconds?: number
  assessmentDefinitionId?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GradeBody | null
  if (!body?.question || !body?.answer || typeof body.timeSpentSeconds !== "number") {
    return NextResponse.json(
      { error: "question, answer, and timeSpentSeconds are required." },
      { status: 400 }
    )
  }

  const ctx = await requireEmployeeAssessmentClient(body.assessmentDefinitionId)
  if (!ctx.ok) return ctx.response

  try {
    // SupabaseAssessmentApiClient.submitAnswer re-fetches the canonical
    // question row by id and grades against that -- it never trusts
    // body.question for anything but its id. The attempt itself is
    // resolved via latestAttempt(userId), scoped by this request's
    // validated assessmentDefinitionId (see requireEmployeeAssessmentClient
    // above) rather than any client-supplied attempt id.
    const result = await ctx.api.submitAnswer({
      assessmentId: String(ctx.assessmentDefinitionId),
      assessmentDefinitionId: String(ctx.assessmentDefinitionId),
      userId: ctx.user.id,
      question: body.question,
      answer: body.answer,
      timeSpentSeconds: body.timeSpentSeconds,
    })
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
