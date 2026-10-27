import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { publishAssessment } from "@/lib/assessment/publish-assessment"

interface RouteParams {
  params: Promise<{ assessmentId: string }>
}
interface PublishBody {
  durationDays: number | null
  availableFrom: string
}

export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx
  if (!ctx.roleNames.includes("admin")) {
    return NextResponse.json({ error: "Only admins can publish assessments." }, { status: 403 })
  }

  const { assessmentId } = await params
  const body = (await request.json().catch(() => null)) as PublishBody | null
  if (!body) {
    return NextResponse.json({ error: "A request body is required." }, { status: 400 })
  }

  try {
    const result = await publishAssessment(supabase, assessmentId, body)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, availableFrom: result.availableFrom, availableUntil: result.availableUntil })
  } catch (err) {
    return toErrorResponse(err)
  }
}
