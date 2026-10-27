import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/require-admin"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ assessmentId: string }>
}

/** Admin sets how long an assessment runs. null = untimed. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { assessmentId } = await params

  const body = (await request.json().catch(() => null)) as { minutes?: unknown } | null
  const minutes = body?.minutes === null ? null : Number(body?.minutes)
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)) {
    return NextResponse.json({ error: "Duration must be a whole number of minutes from 1 to 600, or blank for untimed." }, { status: 400 })
  }

  try {
    const supabase = getServiceRoleClient()
    // Deadlines are computed live from duration_minutes, so changing it mid-attempt would shift them.
    // An expired-but-still-'in_progress' attempt also blocks; that is acceptable.
    const { count, error: countError } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessmentId)
      .eq("status", "in_progress")
    if (countError) throw new Error(`Failed to check live attempts: ${countError.message}`)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Someone is taking this assessment right now. Change the duration after they finish." }, { status: 409 })
    }

    const { data, error } = await supabase
      .from("assessments")
      .update({ duration_minutes: minutes })
      .eq("id", assessmentId)
      .select("id")
      .maybeSingle()
    if (error) throw new Error(`Failed to save the duration: ${error.message}`)
    if (!data) return NextResponse.json({ error: "This assessment no longer exists." }, { status: 404 })
    return NextResponse.json({ minutes })
  } catch (err) {
    return toErrorResponse(err)
  }
}
