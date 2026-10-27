import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/supabase/server"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * RLS's own profile_id = auth.uid() check makes a second manual
 * ownership check unnecessary -- a request for someone else's id simply
 * matches and updates zero rows, which this route reports as 404 rather
 * than a misleading 200 (never reveals whether the id exists at all for
 * another profile).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { id } = await params
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid notification id." }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", numericId)
    .select("id")
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
