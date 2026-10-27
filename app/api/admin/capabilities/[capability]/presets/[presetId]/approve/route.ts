import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { buildAssessmentFromPreset } from "@/lib/assessment/build-assessment-from-preset"
import { publishAssessment } from "@/lib/assessment/publish-assessment"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import { missingLevelsMessage } from "@/lib/assessment/ladder"

interface RouteParams {
  params: Promise<{ capability: string; presetId: string }>
}
interface ApproveBody {
  availableFrom: string
  durationDays: number | null
}

export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx
  if (!ctx.roleNames.includes("admin")) {
    return NextResponse.json({ error: "Only admins can approve a preset." }, { status: 403 })
  }

  const { capability: capabilityId, presetId } = await params
  const body = (await request.json().catch(() => null)) as ApproveBody | null
  if (!body) {
    return NextResponse.json({ error: "A request body is required." }, { status: 400 })
  }

  async function cleanupOrphanedAssessment(assessmentId: number) {
    const { error: cleanupError } = await supabase.from("assessments").delete().eq("id", assessmentId)
    if (cleanupError) {
      console.error(`approve: failed to clean up orphaned assessment ${assessmentId}:`, cleanupError)
    }
  }

  try {
    const { data: statusRow } = await supabase
      .from("preset_current_status")
      .select("status")
      .eq("preset_id", presetId)
      .maybeSingle()
    if (statusRow?.status !== "pending_approval") {
      return NextResponse.json({ error: "This preset is not pending approval." }, { status: 400 })
    }

    const buildResult = await buildAssessmentFromPreset(supabase, { capabilityId, presetId, userId: user.id })
    if (!buildResult.ok) return NextResponse.json({ error: buildResult.error }, { status: buildResult.status })
    if (buildResult.missingLadderLevels.length > 0) {
      await cleanupOrphanedAssessment(buildResult.assessmentId)
      return NextResponse.json(
        { error: missingLevelsMessage(buildResult.missingLadderLevels, "before publishing") },
        { status: 409 }
      )
    }

    let publishResult
    try {
      publishResult = await publishAssessment(supabase, String(buildResult.assessmentId), body)
    } catch (err) {
      await cleanupOrphanedAssessment(buildResult.assessmentId)
      throw err
    }
    if (!publishResult.ok) {
      await cleanupOrphanedAssessment(buildResult.assessmentId)
      return NextResponse.json({ error: publishResult.error }, { status: publishResult.status })
    }

    const { data: approvalRow, error: approvalError } = await supabase
      .from("preset_approvals")
      .insert({ preset_id: presetId, action: "approved", note: null, created_by: user.id })
      .select("id")
      .single()
    if (approvalError || !approvalRow) {
      throw new Error(`Failed to record approval: ${approvalError?.message}`)
    }

    try {
      const { data: lastSubmission } = await supabase
        .from("preset_approvals")
        .select("created_by, note")
        .eq("preset_id", presetId)
        .eq("action", "submitted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const isRequestedAsActive =
        lastSubmission?.note?.toLowerCase().includes("active preset") ||
        lastSubmission?.note?.toLowerCase().includes("preset in use")

      if (isRequestedAsActive) {
        await supabase
          .from("capabilities")
          .update({ current_preset: Number(presetId) })
          .eq("id", capabilityId)
      }

      if (lastSubmission?.created_by) {
        const serviceClient = getServiceRoleClient()
        const { error: notifyError } = await serviceClient.from("notifications").insert({
          profile_id: lastSubmission.created_by,
          type: "preset_approved",
          preset_id: Number(presetId),
          preset_approval_id: approvalRow.id,
        })
        if (notifyError && notifyError.code !== "23505") throw notifyError
      }
    } catch (err) {
      console.error(`approve: submitter notification failed for preset ${presetId}:`, err)
    }

    return NextResponse.json({
      assessmentId: buildResult.assessmentId,
      questionIds: buildResult.questionIds,
      availableFrom: publishResult.availableFrom,
      availableUntil: publishResult.availableUntil,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
