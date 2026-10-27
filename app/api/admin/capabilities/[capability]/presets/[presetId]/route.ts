import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import { mixesLadderAndGraded } from "@/lib/assessment/ladder"
import {
  deletePresetBlockedReason,
  editPresetBlockedReason,
  withdrawsOnEdit,
} from "@/lib/admin/preset-edit-rules"

interface RouteParams {
  params: Promise<{ capability: string; presetId: string }>
}
interface PutBody {
  questionIds?: string[]
}

/** The preset's capability and its current approval status, or null if it isn't in this capability. */
async function loadPreset(supabase: SupabaseClient, capabilityId: string, presetId: string) {
  const { data: preset, error } = await supabase
    .from("question_presets")
    .select("id, capability_id, capabilities(current_preset)")
    .eq("id", presetId)
    .eq("capability_id", capabilityId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load the preset: ${error.message}`)
  if (!preset) return null

  const { data: statusRow, error: statusError } = await supabase
    .from("preset_current_status")
    .select("status")
    .eq("preset_id", presetId)
    .maybeSingle()
  if (statusError) throw new Error(`Failed to load the preset's status: ${statusError.message}`)

  const capability = preset.capabilities as unknown as { current_preset: number | null } | null
  return {
    id: preset.id as number,
    currentPresetId: capability?.current_preset ?? null,
    status: (statusRow?.status as string | undefined) ?? null,
  }
}

/**
 * Replaces the preset's questions. Approved presets are locked; editing a
 * pending one withdraws its approval request first, so the admin can never
 * approve a version they didn't see. The owner resubmits when ready.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { capability: capabilityId, presetId } = await params
  const ctx = await requireCapabilityManager({ presetId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const body = (await request.json().catch(() => null)) as PutBody | null
  const questionIds = body?.questionIds
  if (!Array.isArray(questionIds) || questionIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "questionIds must be a list of question ids." }, { status: 400 })
  }

  try {
    const preset = await loadPreset(supabase, capabilityId, presetId)
    if (!preset) return NextResponse.json({ error: "Preset not found for this capability." }, { status: 404 })

    const locked = editPresetBlockedReason(preset.status)
    if (locked) return NextResponse.json({ error: locked }, { status: 409 })

    if (questionIds.length > 0) {
      const { data: selected, error: typesError } = await supabase
        .from("questions")
        .select("id, type")
        .eq("capability_id", capabilityId)
        .in("id", questionIds)
      if (typesError) throw new Error(`Failed to load the selected questions: ${typesError.message}`)
      if ((selected ?? []).length !== new Set(questionIds).size) {
        return NextResponse.json({ error: "Some questions don't belong to this capability." }, { status: 400 })
      }
      if (mixesLadderAndGraded((selected ?? []).map((q) => q.type as string))) {
        return NextResponse.json(
          { error: "A preset can't mix Yes/No ladder questions with other question types." },
          { status: 400 }
        )
      }
    }

    // Service role: only admins may delete approval rows, but withdrawing
    // your own pending request is part of editing.
    const withdrawn = withdrawsOnEdit(preset.status)
    if (withdrawn) {
      const { error: withdrawError } = await getServiceRoleClient()
        .from("preset_approvals")
        .delete()
        .eq("preset_id", preset.id)
        .eq("action", "submitted")
      if (withdrawError) throw new Error(`Failed to withdraw the approval request: ${withdrawError.message}`)
    }

    const { error: deleteError } = await supabase
      .from("question_preset_questions")
      .delete()
      .eq("preset_id", preset.id)
    if (deleteError) throw new Error(`Failed to update the preset's questions: ${deleteError.message}`)

    if (questionIds.length > 0) {
      const { error: insertError } = await supabase.from("question_preset_questions").insert(
        questionIds.map((questionId, index) => ({ preset_id: preset.id, question_id: questionId, position: index }))
      )
      if (insertError) throw new Error(`Failed to update the preset's questions: ${insertError.message}`)
    }

    // After a withdrawal the status falls back to whatever came before the request (draft or rejected).
    const after = withdrawn ? await loadPreset(supabase, capabilityId, presetId) : preset
    return NextResponse.json({ withdrawn, status: after?.status ?? null })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Deletes any preset except the active one. Its questions, approval history and notifications go with it. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { capability: capabilityId, presetId } = await params
  const ctx = await requireCapabilityManager({ presetId })
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  try {
    const preset = await loadPreset(supabase, capabilityId, presetId)
    if (!preset) return NextResponse.json({ error: "Preset not found for this capability." }, { status: 404 })

    const blocked = deletePresetBlockedReason(preset.id, preset.currentPresetId)
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

    const { data: deleted, error } = await supabase
      .from("question_presets")
      .delete()
      .eq("id", preset.id)
      .select("id")
    if (error) throw new Error(`Failed to delete the preset: ${error.message}`)
    if (!deleted?.length) {
      return NextResponse.json({ error: "You can't delete this preset." }, { status: 403 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
