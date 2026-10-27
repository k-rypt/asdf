import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const ctx = await requireEmployeeAssessmentClient()
  if (!ctx.ok) return ctx.response

  const { questionId } = await params

  try {
    const question = await ctx.api.getQuestion(questionId)
    return NextResponse.json(question)
  } catch (err) {
    return toErrorResponse(err)
  }
}
