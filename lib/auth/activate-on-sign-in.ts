import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Pending means "hasn't signed in yet": the first time a signed-in person
 * reaches any protected page, flip their profile to active. Only a pending
 * profile changes -- an archived ('inactive') one is left alone. Failures
 * are logged, not thrown: a stale badge must never block someone's page.
 */
export async function activatePendingAccount(supabase: SupabaseClient, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ status: "active" })
    .eq("id", profileId)
    .eq("status", "pending")
  if (error) console.error(`Couldn't activate pending account ${profileId}: ${error.message}`)
}
