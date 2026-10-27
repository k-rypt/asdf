import { NextResponse } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import { computeAssessmentWindow } from "@/lib/assessment/assessment-window"
import { determineNewlyDueReminders, type ReminderType } from "@/lib/assessment/determine-newly-due-reminders"
import { chunk, fetchAllPages } from "@/lib/assessment/paginate"

/**
 * Hosted Supabase's PostgREST caps an unpaginated `.select()` at 1000 rows,
 * and a long `.in()` filter list risks the URL-length limit on what is
 * ultimately a GET request -- both silent-truncation failure modes at
 * realistic org sizes (~250 employees x 4 reminder types already clears
 * 1000 notification rows). ID_CHUNK_SIZE bounds every `.in()` filter list
 * this route builds; PAGE_SIZE bounds every single `.select()` response.
 */
const ID_CHUNK_SIZE = 200
const PAGE_SIZE = 1000
/** Rows per insert statement -- Postgres aborts an entire multi-row INSERT
 * on its first constraint violation, so a large batch lets one benign
 * 23505 (another overlapping cron run already inserted that row) discard
 * every other, unrelated newly-due reminder in the same run. Small batches
 * bound the blast radius; they don't eliminate it (see the insert loop's
 * own comment for how that's handled). */
const INSERT_CHUNK_SIZE = 50

/**
 * Runs every 15 minutes via Supabase pg_cron + pg_net (schedule set up
 * manually in the SQL Editor -- see this task's final step; never
 * committed, since it embeds the deployed URL and the shared secret).
 * x-cron-secret is the only auth available to pg_net's call: it isn't a
 * Vercel-signed cron invocation, so there's no platform-level identity
 * to check instead. See the spec's Section 5 for the full design and
 * "Why .insert(), not .upsert()" rationale.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.NOTIFICATIONS_CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const supabase = getServiceRoleClient()

  let assignmentRows: { profile_id: string; capability_id: number; added_at: string }[]
  try {
    // Every profile_capabilities row joined to its capability's one
    // published assessment -- unscoped (system-wide), mirroring the join
    // buildManagerRows (lib/assessment/build-manager-rows.ts) performs for
    // one manager's reports, run here with no caller to scope to. No
    // `.in()` filter to chunk here, so only row-count pagination applies.
    assignmentRows = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from("profile_capabilities")
        .select("profile_id, capability_id, added_at")
        .range(from, to)
      if (error) throw error
      return data ?? []
    }, PAGE_SIZE)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("notifications cron: failed to load profile_capabilities", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const capabilityIds = Array.from(new Set(assignmentRows.map((a) => a.capability_id as number)))
  if (capabilityIds.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  const { data: publishedAssessments, error: assessmentsError } = await supabase
    .from("assessments")
    .select("id, capability_id, available_from, available_until")
    .in("capability_id", capabilityIds)
    .eq("status", "published")
  if (assessmentsError) {
    console.error("notifications cron: failed to load published assessments", assessmentsError)
    return NextResponse.json({ error: assessmentsError.message }, { status: 500 })
  }

  const assessmentByCapability = new Map(
    (publishedAssessments ?? []).map((a) => [a.capability_id as number, a])
  )

  type Candidate = {
    profileId: string
    assessmentId: number
    availableFrom: string | null
    availableUntil: string | null
    addedAt: string
  }
  const candidates: Candidate[] = []
  for (const row of assignmentRows) {
    const assessment = assessmentByCapability.get(row.capability_id as number)
    if (!assessment) continue
    candidates.push({
      profileId: row.profile_id as string,
      assessmentId: assessment.id as number,
      availableFrom: assessment.available_from as string | null,
      availableUntil: assessment.available_until as string | null,
      addedAt: row.added_at as string,
    })
  }
  if (candidates.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  const assessmentIds = Array.from(new Set(candidates.map((c) => c.assessmentId)))
  const profileIds = Array.from(new Set(candidates.map((c) => c.profileId)))

  // Both reads below filter on `.in("profile_id", profileIds)` -- chunked
  // by ID_CHUNK_SIZE, since profileIds scales with headcount and a long
  // `.in()` list risks the URL-length limit on what's ultimately a GET
  // request. Each chunk's result is itself paginated (fetchAllPages),
  // since a single chunk can still exceed PAGE_SIZE rows.
  const profileIdChunks = chunk(profileIds, ID_CHUNK_SIZE)

  // Drop any candidate who already started or finished -- they have no
  // use for "this just opened" or "closing soon". Mirrors
  // flagOverdueAssessments's own "never flag a completed employee" check
  // (lib/assessment/deadline-flags.ts). Without this, each window type
  // still fires at most once per employee per assessment (the partial
  // unique index guarantees that), but it could still fire the one time
  // for someone who no longer needs it.
  let existingAttempts: { assessment_id: number; profile_id: string; status: string }[]
  try {
    existingAttempts = []
    for (const profileIdChunk of profileIdChunks) {
      const rows = await fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from("attempts")
          .select("assessment_id, profile_id, status")
          .in("assessment_id", assessmentIds)
          .in("profile_id", profileIdChunk)
          .in("status", ["completed", "in_progress"])
          .range(from, to)
        if (error) throw error
        return data ?? []
      }, PAGE_SIZE)
      existingAttempts.push(...rows)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("notifications cron: failed to load attempts", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const attemptedKeys = new Set(
    existingAttempts.map((a) => `${a.assessment_id}:${a.profile_id}`)
  )
  const survivingCandidates = candidates.filter(
    (c) => !attemptedKeys.has(`${c.assessmentId}:${c.profileId}`)
  )
  if (survivingCandidates.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  // Existing window-type notifications for the surviving candidates, so
  // determineNewlyDueReminders knows what's already fired.
  let existingNotifications: { profile_id: string; type: string; assessment_id: number }[]
  try {
    existingNotifications = []
    for (const profileIdChunk of profileIdChunks) {
      const rows = await fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from("notifications")
          .select("profile_id, type, assessment_id")
          .is("attempt_id", null)
          .in("assessment_id", assessmentIds)
          .in("profile_id", profileIdChunk)
          .range(from, to)
        if (error) throw error
        return data ?? []
      }, PAGE_SIZE)
      existingNotifications.push(...rows)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("notifications cron: failed to load existing notifications", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const alreadyFiredByKey = new Map<string, Set<ReminderType>>()
  for (const row of existingNotifications) {
    const key = `${row.profile_id}:${row.assessment_id}`
    const set = alreadyFiredByKey.get(key) ?? new Set<ReminderType>()
    set.add(row.type as ReminderType)
    alreadyFiredByKey.set(key, set)
  }

  const now = new Date()
  const rowsToInsert: {
    profile_id: string
    type: ReminderType
    assessment_id: number
  }[] = []
  for (const candidate of survivingCandidates) {
    const window = computeAssessmentWindow({
      availableFrom: candidate.availableFrom,
      availableUntil: candidate.availableUntil,
      addedAt: candidate.addedAt,
      now,
    })
    const key = `${candidate.profileId}:${candidate.assessmentId}`
    const newlyDue = determineNewlyDueReminders({
      state: window.state,
      effectiveFrom: window.effectiveFrom,
      effectiveUntil: window.effectiveUntil,
      addedAt: candidate.addedAt,
      alreadyFired: alreadyFiredByKey.get(key) ?? new Set(),
      now,
    })
    for (const type of newlyDue) {
      rowsToInsert.push({ profile_id: candidate.profileId, type, assessment_id: candidate.assessmentId })
    }
  }

  if (rowsToInsert.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  // Plain insert, not upsert: notifications_window_type_unique is a
  // *partial* index (where attempt_id is null), and supabase-js's
  // on_conflict can't restate that predicate for ON CONFLICT inference.
  // A caught 23505 means another overlapping cron run already inserted one
  // of these rows -- benign, not a failure. Postgres aborts an entire
  // multi-row INSERT on its first conflict, so one benign 23505 in a large
  // batch would otherwise discard every other, unrelated newly-due
  // reminder in the same run -- insert in small chunks (INSERT_CHUNK_SIZE)
  // so a conflict's blast radius is one chunk, not the whole run, and
  // report the count that actually landed rather than the count attempted.
  let insertedCount = 0
  for (const rowsChunk of chunk(rowsToInsert, INSERT_CHUNK_SIZE)) {
    const { error: insertError } = await supabase.from("notifications").insert(rowsChunk)
    if (!insertError) {
      insertedCount += rowsChunk.length
      continue
    }
    if (insertError.code === "23505") {
      // At least one row in this chunk already exists; the whole chunk
      // was rolled back. Retry its rows one at a time so the rows that
      // don't conflict still land, instead of writing off the whole chunk.
      for (const row of rowsChunk) {
        const { error: singleError } = await supabase.from("notifications").insert([row])
        if (!singleError) {
          insertedCount += 1
        } else if (singleError.code !== "23505") {
          console.error("notifications cron: insert failed", singleError)
          return NextResponse.json({ error: singleError.message }, { status: 500 })
        }
      }
      continue
    }
    console.error("notifications cron: insert failed", insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ inserted: insertedCount })
}
