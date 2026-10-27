import type { PublishFailure } from "./publish-assessment"

const ONE_PUBLISHED_INDEX = "assessments_one_published_per_capability"

/**
 * The database allows one published assessment per capability (partial
 * unique index, 2026-09-24 migration). Publishing archives the current one
 * first, so this only trips when two admins publish for the same
 * capability at once -- the second gets a clear message instead of the
 * raw constraint error.
 */
export function publishConflictFailure(error: { code?: string; message: string }): PublishFailure | null {
  if (error.code !== "23505" || !error.message.includes(ONE_PUBLISHED_INDEX)) return null
  return {
    ok: false,
    status: 409,
    error: "Another version was just published for this capability. Refresh and try again.",
  }
}
