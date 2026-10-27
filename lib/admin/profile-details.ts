export interface ProfileDetails {
  givenName: string
  lastName: string
  jobTitle: string | null
}

const MAX_LENGTH = 100

/**
 * Pure, no I/O. Validates the admin "Edit details" body: first and last
 * name required, job title optional (blank clears it). Text is trimmed.
 */
export function parseProfileDetails(
  body: unknown
): { ok: true; details: ProfileDetails } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const givenName = text(b.givenName)
  const lastName = text(b.lastName)
  const jobTitle = text(b.jobTitle)

  if (!givenName || !lastName) return { ok: false, error: "First and last name are required." }
  if ([givenName, lastName, jobTitle].some((v) => v.length > MAX_LENGTH)) {
    return { ok: false, error: `Keep each field under ${MAX_LENGTH} characters.` }
  }
  return { ok: true, details: { givenName, lastName, jobTitle: jobTitle || null } }
}
