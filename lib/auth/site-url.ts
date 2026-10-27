/**
 * Where invited users should land after confirming their email address.
 *
 * `redirectTo` is sent to Supabase, which echoes it back in the invite link
 * after verifying the one-time token. If the value is not in the project's
 * Redirect URLs allow-list, Supabase silently ignores it and falls back to
 * the Site URL -- the user then lands somewhere other than the password
 * form, with no error surfaced anywhere. So the value matters, and it must
 * stay in step with that dashboard setting.
 *
 * Preference order:
 *
 *   1. NEXT_PUBLIC_SITE_URL -- the canonical origin. Set this in production,
 *      and any environment where the incoming request's origin is not what
 *      invited users should see (proxies, preview deployments).
 *   2. The request's own origin -- correct in local dev, where it resolves
 *      to http://localhost:3000 automatically, and needs no configuration.
 *
 * A trailing slash in the env var is trimmed so callers can use plain
 * string concatenation without producing `//auth/set-password`, which
 * Supabase would not match against the allow-list.
 */
export function resolveSiteUrl(requestUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, "")
  }

  return new URL(requestUrl).origin
}

/**
 * The full post-confirmation destination for an invited user.
 *
 * Split out so the path lives in one place: the invite route builds a link
 * with it, and it is the same path that must be allow-listed in the
 * Supabase dashboard.
 */
export function inviteRedirectUrl(requestUrl: string): string {
  return `${resolveSiteUrl(requestUrl)}/auth/set-password`
}
