import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Shared service-role client for writes that cross the employee/manager
 * trust boundary the per-request RLS-scoped client can't satisfy --
 * notifications writes (cron route, completeSession's manager-notify
 * block) need to insert rows for *other* profiles, not their own.
 * calibrate-question.ts and the two admin-invitation routes each
 * duplicate their own copy of this same client construction (no shared
 * helper existed before this feature); those three are left as-is --
 * retrofitting them is unrelated cleanup, out of scope here. Only the
 * two new call sites this feature introduces use this helper.
 */
export function getServiceRoleClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}
