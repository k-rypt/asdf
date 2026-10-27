import "server-only"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import type { AccountDeps } from "./archive-account"
import type { ProfileStatus } from "./account-status"
import { ATTEMPT_GATE_COLUMNS, isLiveAttempt, type AttemptGateRow } from "@/lib/assessment/attempt-gate"

const ADMIN_ROLE_ID = 1
const ARCHIVE_BAN_DURATION = "876000h"

/**
 * Service-role implementations for archive-account.ts. Service role is
 * needed for the auth admin API (ban/unban) and to close another
 * person's attempts; callers must have passed requireAdmin first.
 */
export function createAccountDeps(): AccountDeps {
  const supabase = getServiceRoleClient()
  return {
    async ban(profileId) {
      const { error } = await supabase.auth.admin.updateUserById(profileId, { ban_duration: ARCHIVE_BAN_DURATION })
      if (error) throw new Error(`Failed to ban user: ${error.message}`)
    },
    async unban(profileId) {
      const { error } = await supabase.auth.admin.updateUserById(profileId, { ban_duration: "none" })
      if (error) throw new Error(`Failed to lift ban: ${error.message}`)
    },
    async closeInProgressAttempts(profileId) {
      const { data, error } = await supabase
        .from("attempts")
        .update({ status: "invalidated", completed_at: new Date().toISOString() })
        .eq("profile_id", profileId)
        .eq("status", "in_progress")
        .select("id")
      if (error) throw new Error(`Failed to close in-progress attempts: ${error.message}`)
      return (data ?? []).map((row) => row.id as number)
    },
    async setStatus(profileId, status) {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", profileId)
      if (error) throw new Error(`Failed to update account status: ${error.message}`)
    },
  }
}

export interface ArchiveContext {
  targetStatus: ProfileStatus | null
  targetIsAdmin: boolean
  nonInactiveAdminCount: number
}

/** Inputs for checkArchiveAllowed. */
export async function loadArchiveContext(profileId: string): Promise<ArchiveContext> {
  const supabase = getServiceRoleClient()

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", profileId)
    .maybeSingle()
  if (profileError) throw new Error(`Failed to load profile: ${profileError.message}`)

  const { data: adminRows, error: adminError } = await supabase
    .from("profile_roles")
    .select("profile_id, profiles!inner(status)")
    .eq("profile_role", ADMIN_ROLE_ID)
    .neq("profiles.status", "inactive")
  if (adminError) throw new Error(`Failed to load admins: ${adminError.message}`)

  const { data: targetAdminRow, error: targetAdminError } = await supabase
    .from("profile_roles")
    .select("profile_id")
    .eq("profile_role", ADMIN_ROLE_ID)
    .eq("profile_id", profileId)
    .maybeSingle()
  // Must not fall through as "not an admin" -- that would skip the
  // last-admin guard and could lock every admin out.
  if (targetAdminError) throw new Error(`Failed to check admin role: ${targetAdminError.message}`)

  return {
    targetStatus: (profile?.status as ProfileStatus | undefined) ?? null,
    targetIsAdmin: Boolean(targetAdminRow),
    nonInactiveAdminCount: (adminRows ?? []).length,
  }
}

export interface InProgressAttempt {
  attemptId: number
  assessmentName: string
}

/**
 * Attempts the person is taking right now -- in progress with time left.
 * Stale ones (timer already run out) are left out: they don't block
 * archiving, and archiveAccount closes them.
 */
export async function loadInProgressAttempts(profileId: string): Promise<InProgressAttempt[]> {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from("attempts")
    .select(`${ATTEMPT_GATE_COLUMNS}, assessments(name, duration_minutes)`)
    .eq("profile_id", profileId)
    .eq("status", "in_progress")
  if (error) throw new Error(`Failed to load in-progress attempts: ${error.message}`)
  const now = Date.now()
  return (data ?? []).flatMap((row) => {
    const raw = row as unknown as AttemptGateRow & {
      assessments: AssessmentSummary | AssessmentSummary[] | null
    }
    const assessment = Array.isArray(raw.assessments) ? raw.assessments[0] : raw.assessments
    if (!isLiveAttempt(raw, { durationMinutes: assessment?.duration_minutes ?? null, now })) return []
    return [{ attemptId: raw.id, assessmentName: assessment?.name ?? "Untitled assessment" }]
  })
}

interface AssessmentSummary {
  name: string
  duration_minutes: number | null
}
