import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import {
  isAssessmentApproved,
  canApplyAssessmentToCampaign,
  findDuplicateCapabilityIds,
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
    const { assessmentIds } = body as { assessmentIds: number[] }

    if (!Array.isArray(assessmentIds)) {
      return NextResponse.json({ error: "assessmentIds must be an array" }, { status: 400 })
    }

    // 1. If assessments are being linked, verify approval, single-campaign usage, and single-capability usage
    if (assessmentIds.length > 0) {
      const { data: rows, error: queryError } = await supabase
        .from("assessments")
        .select("id, name, status, capability_id, campaign_id")
        .in("id", assessmentIds)

      if (queryError) {
        throw new Error(`Failed to verify assessments: ${queryError.message}`)
      }

      // Check approval and cross-campaign assignment
      for (const row of rows || []) {
        const check = canApplyAssessmentToCampaign(row, numericCampaignId)
        if (!check.canApply) {
          return NextResponse.json(
            {
              error: `"${row.name}": ${check.reason}`,
            },
            { status: 400 }
          )
        }
      }

      // Check duplicate capabilities in this campaign: a capability assessment can only be applied once per campaign
      const duplicateCapIds = findDuplicateCapabilityIds(rows || [])
      if (duplicateCapIds.length > 0) {
        return NextResponse.json(
          {
            error:
              "Multiple assessment modules were selected for the same capability. A capability assessment can only be applied once per campaign.",
          },
          { status: 400 }
        )
      }
    }

    // 2. Unlink any assessments currently linked to this campaign
    const { error: unlinkError } = await supabase
      .from("assessments")
      .update({ campaign_id: null })
      .eq("campaign_id", numericCampaignId)

    if (unlinkError) {
      throw new Error(`Failed to unlink existing assessments: ${unlinkError.message}`)
    }

    // 3. Link the newly selected assessments
    if (assessmentIds.length > 0) {
      const { error: linkError } = await supabase
        .from("assessments")
        .update({ campaign_id: numericCampaignId })
        .in("id", assessmentIds)

      if (linkError) {
        throw new Error(`Failed to link assessments: ${linkError.message}`)
      }
    }

    return NextResponse.json({ ok: true, linkedCount: assessmentIds.length })
  } catch (err) {
    return toErrorResponse(err)
  }
}
