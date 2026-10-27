import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function GET() {
  const ctx = await requireEmployeeAssessmentClient()
  if (!ctx.ok) return ctx.response

  try {
    const ids = await ctx.api.listQuestionIds()
    return NextResponse.json(ids)
  } catch (err) {
    return toErrorResponse(err)
  }
}
