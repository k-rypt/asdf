import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { LEVEL_COLUMNS, levelToRow, parseLadderLevelInput, rowToLevel } from "@/lib/assessment/ladder"
import { syncCapabilityDrafts } from "@/lib/assessment/sync-assessment-tiers"

interface RouteParams {
  params: Promise<{ capability: string; sfiaLevel: string }>
}

function parseLevel(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : null
}

/** Creates or replaces one ladder level, then re-copies it into the capability's draft assessments. */
export async function PUT(request: Request, { params }: RouteParams) {
  const { capability: capabilityId, sfiaLevel: rawLevel } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response
  const sfiaLevel = parseLevel(rawLevel)
  if (sfiaLevel === null) return NextResponse.json({ error: "Level must be 1 to 7." }, { status: 400 })

  const parsed = parseLadderLevelInput(await request.json().catch(() => null), sfiaLevel)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const { data, error } = await ctx.supabase
      .from("capability_ladder_levels")
      .upsert(levelToRow(Number(capabilityId), parsed.level, ctx.user.id), { onConflict: "capability_id,sfia_level" })
      .select(LEVEL_COLUMNS)
      .single()
    if (error || !data) throw new Error(`Failed to save the level: ${error?.message}`)
    const { failedAssessmentIds } = await syncCapabilityDrafts(ctx.supabase, Number(capabilityId))
    return NextResponse.json({ level: rowToLevel(data), failedAssessmentIds })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Removes a level no yes/no question uses. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const { capability: capabilityId, sfiaLevel: rawLevel } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response
  const sfiaLevel = parseLevel(rawLevel)
  if (sfiaLevel === null) return NextResponse.json({ error: "Level must be 1 to 7." }, { status: 400 })

  try {
    const { count, error: countError } = await ctx.supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("capability_id", capabilityId)
      .eq("type", "yes_no")
      .eq("sfia_level", sfiaLevel)
    if (countError) throw new Error(`Failed to check the level's questions: ${countError.message}`)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Move or delete the ${count} question${count === 1 ? "" : "s"} at this level first.` },
        { status: 409 }
      )
    }
    // No re-sync needed: an unused level is never in any assessment's snapshot.
    const { error } = await ctx.supabase
      .from("capability_ladder_levels")
      .delete()
      .eq("capability_id", capabilityId)
      .eq("sfia_level", sfiaLevel)
    if (error) throw new Error(`Failed to delete the level: ${error.message}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
