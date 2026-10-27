import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

/**
 * GET: Fetches the assignment status for a capability:
 * - List of currently assigned profile IDs
 * - Per-department breakdown of assigned counts vs total members
 */
export async function GET(request: Request, { params }: RouteParams) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response
  const { supabase } = ctx

  const { campaignId } = await params
  const numericCampaignId = parseInt(campaignId, 10)
  if (isNaN(numericCampaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const capabilityIdParam = searchParams.get("capabilityId")
  const capabilityId = capabilityIdParam ? parseInt(capabilityIdParam, 10) : null

  if (!capabilityId) {
    return NextResponse.json({ error: "capabilityId is required" }, { status: 400 })
  }

  try {
    const [{ data: depts, error: deptsErr }, { data: pDepts, error: pdErr }, { data: capRows, error: capErr }] =
      await Promise.all([
        supabase
          .from("departments")
          .select("id, name, status, profile_departments(count)")
          .order("name", { ascending: true }),
        supabase
          .from("profile_departments")
          .select("department_id, profile_id"),
        supabase
          .from("profile_capabilities")
          .select("profile_id, assignment_type")
          .eq("capability_id", capabilityId),
      ])

    if (deptsErr) throw deptsErr
    if (pdErr) throw pdErr
    if (capErr) throw capErr

    // Set of assigned profile IDs (assessment type)
    const assignedProfileIds = (capRows || [])
      .filter((r) => r.assignment_type === "assessment" || !r.assignment_type)
      .map((r) => r.profile_id)

    const assignedSet = new Set(assignedProfileIds)

    // Build department breakdown
    const departmentBreakdown: Record<
      number,
      { id: number; name: string; totalMembers: number; assignedCount: number }
    > = {}

    for (const d of depts || []) {
      const memberRows = (pDepts || []).filter((pd) => pd.department_id === d.id)
      const totalMembers = memberRows.length
      const assignedCount = memberRows.filter((pd) => assignedSet.has(pd.profile_id)).length

      departmentBreakdown[d.id] = {
        id: d.id,
        name: d.name,
        totalMembers,
        assignedCount,
      }
    }

    return NextResponse.json({
      capabilityId,
      assignedProfileIds,
      totalAssigned: assignedSet.size,
      departmentBreakdown,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST: Set-based assignment update:
 * Accepts selectedDeptIds, excludedProfileIds, and includedProfileIds.
 * Calculates target profile IDs directly and performs atomic batch diff in database.
 */
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
    const {
      capabilityId,
      selectedDeptIds,
      excludedProfileIds = [],
      includedProfileIds = [],
      profileIds,
    } = body as {
      capabilityId: number
      selectedDeptIds?: number[]
      excludedProfileIds?: string[]
      includedProfileIds?: string[]
      profileIds?: string[]
    }

    if (!capabilityId || typeof capabilityId !== "number") {
      return NextResponse.json({ error: "Valid capabilityId is required" }, { status: 400 })
    }

    let targetProfileIds: Set<string>

    if (Array.isArray(profileIds)) {
      // Legacy direct array mode
      targetProfileIds = new Set(profileIds)
    } else {
      // Set-based mode:
      // 1. Fetch profile_ids belonging to selectedDeptIds
      const excludedSet = new Set(excludedProfileIds || [])
      const targetIds = new Set<string>(includedProfileIds || [])

      if (Array.isArray(selectedDeptIds) && selectedDeptIds.length > 0) {
        const { data: deptMembers, error: deptErr } = await supabase
          .from("profile_departments")
          .select("profile_id, department_id")
          .in("department_id", selectedDeptIds)

        if (deptErr) {
          throw new Error(`Failed to query department members: ${deptErr.message}`)
        }

        for (const row of deptMembers || []) {
          if (!excludedSet.has(row.profile_id)) {
            targetIds.add(row.profile_id)
          }
        }
      }

      targetProfileIds = targetIds
    }

    // 2. Fetch existing assignments for capabilityId
    const { data: existingRows, error: fetchErr } = await supabase
      .from("profile_capabilities")
      .select("profile_id, assignment_type")
      .eq("capability_id", capabilityId)

    if (fetchErr) {
      throw new Error(`Failed to read existing capability assignments: ${fetchErr.message}`)
    }

    const existingAssessmentSet = new Set<string>()
    const existingManagementSet = new Set<string>()

    for (const row of existingRows || []) {
      if (row.assignment_type === "management") {
        existingManagementSet.add(row.profile_id)
      } else {
        existingAssessmentSet.add(row.profile_id)
      }
    }

    // Determine profiles to remove (only assessment rows not in target)
    const toRemove = [...existingAssessmentSet].filter((id) => !targetProfileIds.has(id))

    // Determine profiles to add (skip existing assessment or management owners)
    const toAdd = [...targetProfileIds].filter(
      (id) => !existingAssessmentSet.has(id) && !existingManagementSet.has(id)
    )

    // Execute deletions in batches of 500
    if (toRemove.length > 0) {
      const BATCH_SIZE = 500
      for (let i = 0; i < toRemove.length; i += BATCH_SIZE) {
        const chunk = toRemove.slice(i, i + BATCH_SIZE)
        const { error: delErr } = await supabase
          .from("profile_capabilities")
          .delete()
          .eq("capability_id", capabilityId)
          .eq("assignment_type", "assessment")
          .in("profile_id", chunk)

        if (delErr) {
          throw new Error(`Failed to remove capability assignments: ${delErr.message}`)
        }
      }
    }

    // Execute insertions in batches of 500
    if (toAdd.length > 0) {
      const now = new Date().toISOString()
      const BATCH_SIZE = 500
      for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
        const chunk = toAdd.slice(i, i + BATCH_SIZE)
        const insertRows = chunk.map((pid) => ({
          profile_id: pid,
          capability_id: capabilityId,
          assignment_type: "assessment",
          added_at: now,
        }))

        const { error: insErr } = await supabase
          .from("profile_capabilities")
          .insert(insertRows)

        if (insErr) {
          throw new Error(`Failed to save capability assignments: ${insErr.message}`)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      capabilityId,
      assignedCount: targetProfileIds.size,
      added: toAdd.length,
      removed: toRemove.length,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
