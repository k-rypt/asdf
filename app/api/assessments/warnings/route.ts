import { NextResponse } from "next/server"
import { requireEmployeeAssessmentClient } from "@/lib/assessment/require-employee-assessment-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

export async function POST(request: Request) {
  const ctx = await requireEmployeeAssessmentClient()
  if (!ctx.ok) return ctx.response

  const body = await request.json().catch(() => null)
  const assessmentId = body?.assessmentId
  const warningCount = body?.warningCount
  if (!assessmentId || typeof warningCount !== "number") {
    return NextResponse.json({ error: "assessmentId and warningCount are required." }, { status: 400 })
  }

  try {
    // Currently a no-op server-side -- see the file header on
    // supabase-assessment-api-client.ts (attempts has no infraction column yet).
    await ctx.api.recordWarning(String(assessmentId), ctx.user.id, warningCount)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
