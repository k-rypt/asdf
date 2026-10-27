import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { buildAssessmentFromPreset } from "@/lib/assessment/build-assessment-from-preset"

interface RouteParams {
  params: Promise<{ capability: string; presetId: string }>
}

export async function POST(_request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx
  if (!ctx.roleNames.includes("admin")) {
    return NextResponse.json({ error: "Only admins can build an assessment from a preset." }, { status: 403 })
  }

  const { capability: capabilityId, presetId } = await params

  try {
    const result = await buildAssessmentFromPreset(supabase, { capabilityId, presetId, userId: user.id })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({
      assessmentId: result.assessmentId,
      questionIds: result.questionIds,
      missingLadderLevels: result.missingLadderLevels,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
