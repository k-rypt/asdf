import "server-only"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import type { AssessmentApiClient } from "@assessment-toolkit/core"
import { createClient } from "@/supabase/server"
import { createSupabaseAssessmentApiClient } from "./supabase-assessment-api-client"
import { computeAssessmentWindow } from "./assessment-window"
import { loadInProgressAssessmentIds, publishedOrInProgress } from "@/lib/assessment/resolvable-assessments"

/**
 * Shared auth/resolution step for every app/api/assessments, app/api/questions,
 * and app/api/submissions/grade route handler.
 *
 * Deliberately never trusts a client-supplied userId (the REST contract from
 * assessment-toolkit's createRestApiClient puts one in some request bodies/
 * URLs, e.g. `/api/assessments/status/${userId}`) -- identity always comes
 * from the request's own Supabase session cookie instead. Every call site
 * below should use `user.id`, not anything read off the request.
 *
 * Assessment resolution: `questions`/`assessment_questions` is one bank per
 * assessment definition, and an assessment belongs to a capability
 * (assessments.capability_id). There's no picker UI for this yet, so this
 * resolves to the signed-in employee's own capability (via
 * profile_capabilities) and takes the first *published* assessment for it.
 * If an employee has more than one capability with more than one published
 * assessment and no explicit `assessmentDefinitionId` is passed, this
 * resolves to whichever one already has an in-progress attempt (so a
 * mid-attempt call never silently resolves to a different assessment);
 * with no in-progress attempt either, it falls back to the lowest-id
 * published assessment, same as before this file supported an explicit id.
 * A caller that knows exactly which assessment it wants (the employee
 * deep-linked to one) passes `assessmentDefinitionId` explicitly.
 */

interface SuccessResult {
  ok: true
  user: User
  api: AssessmentApiClient
  /** `assessments.id` -- the static definition, not an attempt id. */
  assessmentDefinitionId: number
}

interface FailureResult {
  ok: false
  response: NextResponse
}

export async function requireEmployeeAssessmentClient(
  assessmentDefinitionId?: string
): Promise<SuccessResult | FailureResult> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) }
  }

  // Mirrors the role check in app/protected/employee/layout.tsx -- that's a
  // UX gate, this is the same check enforced at the actual trust boundary.
  const { data: roleRows, error: roleError } = await supabase
    .from("profile_roles")
    .select("roles(name)")
    .eq("profile_id", user.id)
  if (roleError) {
    return { ok: false, response: NextResponse.json({ error: roleError.message }, { status: 500 }) }
  }
  const roleNames = (roleRows ?? [])
    .map((row) => (row.roles as unknown as { name: string } | null)?.name)
    .filter((name): name is string => Boolean(name))
  if (!roleNames.includes("employee")) {
    return { ok: false, response: NextResponse.json({ error: "Not an employee." }, { status: 403 }) }
  }

  const { data: capabilityRows, error: capabilityError } = await supabase
    .from("profile_capabilities")
    .select("capability_id, added_at")
    .eq("profile_id", user.id)
  if (capabilityError) {
    return { ok: false, response: NextResponse.json({ error: capabilityError.message }, { status: 500 }) }
  }
  const capabilityIds = (capabilityRows ?? []).map((row) => row.capability_id as number)
  if (capabilityIds.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No capability assigned -- nothing to assess yet." }, { status: 404 }),
    }
  }

  // Published assessments, plus any this employee is mid-attempt on even
  // if a newer version has since replaced it.
  const inProgressAssessmentIds = await loadInProgressAssessmentIds(supabase, user.id)
  let assessmentQuery = supabase
    .from("assessments")
    .select("id, capability_id, available_from, available_until")
    .in("capability_id", capabilityIds)
    .or(publishedOrInProgress(inProgressAssessmentIds))

  if (assessmentDefinitionId != null) {
    // Caller knows exactly which assessment they want (the employee
    // deep-linked to it) -- resolve that one, still re-validated against
    // the employee's own capabilities above via the .in() filter already
    // applied. An id that doesn't belong to one of this employee's
    // capabilities (or isn't published) simply won't match, and falls
    // through to the same 404 every other "nothing to resolve" case uses
    // below -- no separate error shape for "wrong id" vs "no assessment at
    // all", matching this file's existing "don't reveal what exists"
    // posture.
    //
    // A non-numeric id becomes NaN, and `.eq("id", NaN)` against a numeric
    // column is a query Postgres can reject outright (surfacing as a raw
    // 500) instead of the clean 404 every other "nothing to resolve" case
    // gets -- short-circuit to that same 404 instead. Final-review finding.
    const numericId = Number(assessmentDefinitionId)
    if (!Number.isFinite(numericId)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "No published assessment for your capability yet." },
          { status: 404 }
        ),
      }
    }
    assessmentQuery = assessmentQuery.eq("id", numericId)
  } else {
    // No explicit id: prefer whichever assessment the employee already has
    // an in-progress attempt on, over "first published by id". Without
    // this, every non-start/status call (heartbeat, submitAnswer,
    // getNextQuestion, completeSession) would re-derive "first published"
    // on every request -- fine as long as an employee can only ever reach
    // one assessment (true before this plan), but wrong the moment a
    // second published assessment is reachable (true after it): a call
    // made mid-attempt on the second assessment would silently resolve
    // back to the first one, and latestAttempt's closure-bound id would
    // never find the real in-progress row.
    if (inProgressAssessmentIds.length > 0) {
      assessmentQuery = assessmentQuery.in("id", inProgressAssessmentIds)
    }
  }

  const { data: assessmentRow, error: assessmentError } = await assessmentQuery
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (assessmentError) {
    return { ok: false, response: NextResponse.json({ error: assessmentError.message }, { status: 500 }) }
  }
  if (!assessmentRow) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No published assessment for your capability yet." },
        { status: 404 }
      ),
    }
  }

  // capabilityRows is where capabilityIds came from, so this always finds
  // a match -- non-null assertion is safe here, not a guess.
  const addedAt = capabilityRows!.find((row) => row.capability_id === assessmentRow.capability_id)!
    .added_at as string

  const window = computeAssessmentWindow({
    availableFrom: assessmentRow.available_from,
    availableUntil: assessmentRow.available_until,
    addedAt,
  })
  if (window.state !== "available") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            window.state === "not_yet"
              ? "This assessment isn't open yet."
              : "Your window to take this assessment has closed.",
        },
        { status: 404 }
      ),
    }
  }

  return {
    ok: true,
    user,
    api: createSupabaseAssessmentApiClient(supabase, assessmentRow.id),
    assessmentDefinitionId: assessmentRow.id,
  }
}
