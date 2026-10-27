import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import {
  isAssessmentApproved,
  canApplyAssessmentToCampaign,
  computeCascadeShiftedSchedules,
} from "@/lib/assessment/schedule-conflicts"

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const { campaignId } = await params
  const numericCampaignId = parseInt(campaignId, 10)
  if (isNaN(numericCampaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { assessmentId, availableFrom, availableUntil } = body as {
      assessmentId: number
      availableFrom: string | null
      availableUntil: string | null
    }

    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId is required" }, { status: 400 })
    }

    if (availableFrom && availableUntil) {
      // 1. Verify assessment exists, is approved, and not already applied elsewhere
      const { data: assessment, error: fetchError } = await supabase
        .from("assessments")
        .select("id, name, status, capability_id, campaign_id")
        .eq("id", assessmentId)
        .single()

      if (fetchError || !assessment) {
        return NextResponse.json({ error: "Assessment not found" }, { status: 404 })
      }

      const applyCheck = canApplyAssessmentToCampaign(assessment, numericCampaignId)
      if (!applyCheck.canApply) {
        return NextResponse.json(
          {
            error: `"${assessment.name}": ${applyCheck.reason}`,
          },
          { status: 400 }
        )
      }

      // Check if another assessment module is already applied for this capability in this campaign
      if (assessment.capability_id) {
        const { data: existingCap, error: capError } = await supabase
          .from("assessments")
          .select("id, name")
          .eq("campaign_id", numericCampaignId)
          .eq("capability_id", assessment.capability_id)
          .neq("id", assessmentId)

        if (capError) {
          throw new Error(`Failed to check existing capability assessments: ${capError.message}`)
        }

        if (existingCap && existingCap.length > 0) {
          return NextResponse.json(
            {
              error: `Another assessment module ("${existingCap[0].name}") is already applied for this capability in this campaign. A capability assessment can only be applied once per campaign.`,
            },
            { status: 400 }
          )
        }
      }

      // 2. Scheduling: associate assessment with this campaign and set availability window
      const { error: updateError } = await supabase
        .from("assessments")
        .update({
          campaign_id: numericCampaignId,
          available_from: availableFrom,
          available_until: availableUntil,
        })
        .eq("id", assessmentId)

      if (updateError) {
        throw new Error(`Failed to update assessment schedule: ${updateError.message}`)
      }
    } else {
      // Unscheduling: clear time window and unlink from campaign (returns to available pool)
      const { error: updateError } = await supabase
        .from("assessments")
        .update({
          campaign_id: null,
          available_from: null,
          available_until: null,
        })
        .eq("id", assessmentId)
        .eq("campaign_id", numericCampaignId)

      if (updateError) {
        throw new Error(`Failed to clear assessment schedule: ${updateError.message}`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH: Cascade Shifts all scheduled assessments in a campaign forward.
 * Moves the earliest module to targetStartTime (defaults to now), preserving
 * all durations, gaps, and non-overlapping sequence.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const { campaignId } = await params
  const numericCampaignId = parseInt(campaignId, 10)
  if (isNaN(numericCampaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { targetStartTime } = (body || {}) as { targetStartTime?: string }
    const anchor = targetStartTime ? new Date(targetStartTime) : new Date()

    // 1. Fetch all scheduled assessments for this campaign
    const { data: rows, error: fetchError } = await supabase
      .from("assessments")
      .select("id, name, available_from, available_until")
      .eq("campaign_id", numericCampaignId)
      .not("available_from", "is", null)
      .not("available_until", "is", null)

    if (fetchError) {
      throw new Error(`Failed to load schedules: ${fetchError.message}`)
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "No scheduled assessments found to shift." },
        { status: 400 }
      )
    }

    const shifted = computeCascadeShiftedSchedules(rows, anchor)
    if (shifted.length === 0) {
      return NextResponse.json({ ok: true, shiftedCount: 0 })
    }

    // 2. Perform updates for each shifted row
    for (const item of shifted) {
      const { error: updateError } = await supabase
        .from("assessments")
        .update({
          available_from: item.available_from,
          available_until: item.available_until,
        })
        .eq("id", item.id)
        .eq("campaign_id", numericCampaignId)

      if (updateError) {
        throw new Error(`Failed to update shifted schedule for assessment #${item.id}: ${updateError.message}`)
      }
    }

    return NextResponse.json({
      ok: true,
      shiftedCount: shifted.length,
      shiftedMinutes: shifted[0]?.shiftedMinutes || 0,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
