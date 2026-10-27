import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ capability: string }>
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { capability: capabilityIdStr } = await params
  const capabilityId = Number(capabilityIdStr)
  if (!Number.isFinite(capabilityId)) {
    return NextResponse.json({ error: "Invalid capability ID." }, { status: 400 })
  }

  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response

  try {
    const serviceClient = getServiceRoleClient()

    // 1. Fetch current_preset and all preset ids for this capability
    const { data: capData } = await serviceClient
      .from("capabilities")
      .select("current_preset")
      .eq("id", capabilityId)
      .single()

    const currentPresetId = capData?.current_preset

    const { data: capPresets } = await serviceClient
      .from("question_presets")
      .select("id")
      .eq("capability_id", capabilityId)

    const presetIds = (capPresets ?? []).map((p) => p.id)
    if (currentPresetId && !presetIds.includes(currentPresetId)) {
      presetIds.push(currentPresetId)
    }

    const { error: updateError } = await serviceClient
      .from("capabilities")
      .update({ current_preset: null })
      .eq("id", capabilityId)

    if (updateError) throw updateError

    // 2. If a preset was waiting approval but was removed as active, the approval disappears.
    if (presetIds.length > 0) {
      await serviceClient
        .from("preset_approvals")
        .delete()
        .in("preset_id", presetIds)
        .eq("action", "submitted")
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { capability: capabilityIdStr } = await params
  const capabilityId = Number(capabilityIdStr)
  if (!Number.isFinite(capabilityId)) {
    return NextResponse.json({ error: "Invalid capability ID." }, { status: 400 })
  }

  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response

  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    presetId?: number | string
    note?: string
  }
  const presetId = Number(body.presetId)
  if (!Number.isFinite(presetId)) {
    return NextResponse.json({ error: "A valid preset ID is required." }, { status: 400 })
  }

  try {
    const serviceClient = getServiceRoleClient()

    // 1. Verify preset belongs to this capability
    const { data: preset, error: presetError } = await serviceClient
      .from("question_presets")
      .select("id, name, capability_id")
      .eq("id", presetId)
      .eq("capability_id", capabilityId)
      .single()

    if (presetError || !preset) {
      return NextResponse.json({ error: "Preset not found for this capability." }, { status: 404 })
    }

    // 2. Validate that preset has questions
    const { count: questionCount, error: countError } = await serviceClient
      .from("question_preset_questions")
      .select("*", { count: "exact", head: true })
      .eq("preset_id", presetId)

    if (countError) throw countError
    if (!questionCount || questionCount === 0) {
      return NextResponse.json(
        { error: "This preset has no questions. Please add questions before setting it as the active preset." },
        { status: 400 }
      )
    }

    // 3. Fetch current capability state
    const { data: capData } = await serviceClient
      .from("capabilities")
      .select("current_preset")
      .eq("id", capabilityId)
      .single()

    const previousPresetId = capData?.current_preset

    // If changing active preset and the previous one was pending approval, delete the previous submission
    if (previousPresetId && previousPresetId !== presetId) {
      await serviceClient
        .from("preset_approvals")
        .delete()
        .eq("preset_id", previousPresetId)
        .eq("action", "submitted")
    }

    // 4. Set current_preset on capability
    const { error: updateError } = await serviceClient
      .from("capabilities")
      .update({ current_preset: presetId })
      .eq("id", capabilityId)

    if (updateError) throw updateError

    // 5. Check if preset was already approved
    const { data: statusRow } = await serviceClient
      .from("preset_current_status")
      .select("status")
      .eq("preset_id", presetId)
      .maybeSingle()

    // Active presets require admin approval unless already approved
    if (statusRow?.status !== "approved") {
      await serviceClient.from("preset_approvals").insert({
        preset_id: presetId,
        action: "submitted",
        created_by: ctx.user.id,
        note: body.note?.trim() || `Requested active preset set to "${preset.name}"`,
      })
    }

    return NextResponse.json({
      ok: true,
      currentPreset: presetId,
      status: statusRow?.status === "approved" ? "approved" : "pending_approval",
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request, params: RouteParams) {
  // If the request has a JSON body with presetId, treat as PUT (set active preset)
  const clone = request.clone()
  const body = (await clone.json().catch(() => null)) as { presetId?: unknown } | null
  if (body && typeof body === "object" && "presetId" in body) {
    return PUT(request, params)
  }
  return DELETE(request, params)
}
