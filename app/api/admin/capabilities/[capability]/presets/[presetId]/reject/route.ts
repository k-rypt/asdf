import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ capability: string; presetId: string }>
}
interface RejectBody {
  note: string
}

export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx
  if (!ctx.roleNames.includes("admin")) {
    return NextResponse.json({ error: "Only admins can reject a preset." }, { status: 403 })
  }

  const { presetId } = await params
  const body = (await request.json().catch(() => null)) as RejectBody | null
  const note = body?.note?.trim()
  if (!note) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 })
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

    const { data: approvalRow, error: approvalError } = await supabase
      .from("preset_approvals")
      .insert({ preset_id: presetId, action: "rejected", note, created_by: user.id })
      .select("id")
      .single()
    if (approvalError || !approvalRow) {
      throw new Error(`Failed to record rejection: ${approvalError?.message}`)
    }

    try {
      const { data: lastSubmission } = await supabase
        .from("preset_approvals")
        .select("created_by")
        .eq("preset_id", presetId)
        .eq("action", "submitted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastSubmission?.created_by) {
        const serviceClient = getServiceRoleClient()
        const { error: notifyError } = await serviceClient.from("notifications").insert({
          profile_id: lastSubmission.created_by,
          type: "preset_rejected",
          preset_id: Number(presetId),
          preset_approval_id: approvalRow.id,
        })
        if (notifyError && notifyError.code !== "23505") throw notifyError
      }
    } catch (err) {
      console.error(`reject: submitter notification failed for preset ${presetId}:`, err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
