import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { submitPresetBlockedReason } from "@/lib/admin/preset-edit-rules"

interface RouteParams {
  params: Promise<{ capability: string; presetId: string }>
}
interface SubmitBody {
  note?: string
}

export async function POST(request: Request, { params }: RouteParams) {
  const { presetId } = await params
  const ctx = await requireCapabilityManager({ presetId })
  if (!ctx.ok) return ctx.response
  const { supabase, user } = ctx

  const body = ((await request.json().catch(() => ({}))) ?? {}) as SubmitBody

  try {
    const { data: statusRow } = await supabase
      .from("preset_current_status")
      .select("status")
      .eq("preset_id", presetId)
      .maybeSingle()
    const { data: preset, error: presetError } = await supabase
      .from("question_presets")
      .select("capabilities(current_preset)")
      .eq("id", presetId)
      .maybeSingle()
    if (presetError) throw new Error(`Failed to load the preset: ${presetError.message}`)
    const capability = preset?.capabilities as unknown as { current_preset: number | null } | null
    // Approval belongs to the active preset only (see lib/admin/preset-edit-rules.ts).
    const blocked = submitPresetBlockedReason(statusRow?.status, Number(presetId), capability?.current_preset)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

    const { error: insertError } = await supabase.from("preset_approvals").insert({
      preset_id: presetId,
      action: "submitted",
      note: body.note?.trim() || null,
      created_by: user.id,
    })
    if (insertError) throw new Error(`Failed to submit preset: ${insertError.message}`)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
