import { NextResponse } from "next/server"
import { requireCapabilityManager } from "@/lib/assessment/require-capability-admin-client"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { loadLadder } from "@/lib/assessment/sync-assessment-tiers"

interface RouteParams {
  params: Promise<{ capability: string }>
}

/** The capability's ladder, with how many yes/no questions sit at each level. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { capability: capabilityId } = await params
  const ctx = await requireCapabilityManager({ capabilityId })
  if (!ctx.ok) return ctx.response

  try {
    const [levels, { data: questions, error }] = await Promise.all([
      loadLadder(ctx.supabase, Number(capabilityId)),
      ctx.supabase.from("questions").select("sfia_level").eq("capability_id", capabilityId).eq("type", "yes_no"),
    ])
    if (error) throw new Error(`Failed to count ladder questions: ${error.message}`)
    const counts = new Map<number, number>()
    for (const q of questions ?? []) {
      if (q.sfia_level != null) counts.set(q.sfia_level, (counts.get(q.sfia_level) ?? 0) + 1)
    }
    return NextResponse.json({ levels: levels.map((l) => ({ ...l, questionCount: counts.get(l.sfiaLevel) ?? 0 })) })
  } catch (err) {
    return toErrorResponse(err)
  }
}
