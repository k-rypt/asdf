import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/supabase/server"

type OneOrMany<T> = T | T[] | null

/** One notifications row with the embeds selected below. */
interface NotificationQueryRow {
  id: number
  type: string
  assessment_id: number | null
  attempt_id: number | null
  preset_id: number | null
  preset_approval_id: number | null
  read_at: string | null
  created_at: string
  assessments: OneOrMany<{ name: string }>
  attempts: OneOrMany<{ profile_id: string; profiles: OneOrMany<{ given_name: string | null; last_name: string | null }> }>
  question_presets: OneOrMany<{ name: string; capability_id: number }>
}

/**
 * RLS-scoped per-request client -- no service-role needed, since the
 * select policy already restricts to the caller's own rows
 * (profile_id = auth.uid()). Joins assessments(name), attempts(profile_id,
 * profiles(given_name, last_name)), and question_presets(name,
 * capability_id) -- the UI needs these to render copy and build links,
 * since the table stores no pre-rendered message or link by design.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, assessment_id, attempt_id, preset_id, preset_approval_id, read_at, created_at, assessments(name), attempts(profile_id, profiles(given_name, last_name)), question_presets(name, capability_id)"
    )
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = ((data ?? []) as unknown as NotificationQueryRow[]).map((row) => {
    const assessment = Array.isArray(row.assessments) ? row.assessments[0] : row.assessments
    const attempt = Array.isArray(row.attempts) ? row.attempts[0] : row.attempts
    const completer = attempt
      ? Array.isArray(attempt.profiles)
        ? attempt.profiles[0]
        : attempt.profiles
      : null
    const preset = Array.isArray(row.question_presets) ? row.question_presets[0] : row.question_presets
    return {
      id: row.id,
      type: row.type,
      assessment_id: row.assessment_id,
      attempt_id: row.attempt_id,
      preset_id: row.preset_id,
      preset_approval_id: row.preset_approval_id,
      read_at: row.read_at,
      created_at: row.created_at,
      assessment_name: assessment?.name ?? null,
      completer_profile_id: attempt?.profile_id ?? null,
      completer_given_name: completer?.given_name ?? null,
      completer_last_name: completer?.last_name ?? null,
      preset_name: preset?.name ?? null,
      capability_id: preset?.capability_id ?? null,
    }
  })

  return NextResponse.json(rows)
}
