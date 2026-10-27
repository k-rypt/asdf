import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import { ATTEMPT_GATE_COLUMNS, isLiveAttempt, type AttemptGateRow } from "@/lib/assessment/attempt-gate"

interface RouteParams {
  params: Promise<{ capability: string }>
}

/**
 * For the publish confirmation: how many people are taking this
 * capability's currently published assessment right now. Publishing a new
 * version doesn't interrupt them -- they finish on the one they started.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const capabilityId = Number((await params).capability)
  if (!Number.isFinite(capabilityId)) return NextResponse.json({ count: 0 })

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from("attempts")
      .select(`${ATTEMPT_GATE_COLUMNS}, assessments!inner(duration_minutes)`)
      .eq("status", "in_progress")
      .eq("assessments.capability_id", capabilityId)
      .eq("assessments.status", "published")
    if (error) throw new Error(`Failed to load in-progress attempts: ${error.message}`)

    const now = Date.now()
    const count = ((data ?? []) as unknown as (AttemptGateRow & { assessments: { duration_minutes: number | null } })[])
      .filter((a) => isLiveAttempt(a, { durationMinutes: a.assessments.duration_minutes, now })).length
    return NextResponse.json({ count })
  } catch (err) {
    return toErrorResponse(err)
  }
}
