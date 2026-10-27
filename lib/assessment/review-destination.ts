export interface ReviewAttempt {
  attemptId: number
  assessmentId: number
  capabilityId: number
  profileId: string
}

/**
 * Where a completed-attempt notification takes its reader. Managers and
 * the capability's owner are both notified, each reviewing from their own
 * area; someone who is both goes to the manager page.
 */
export function reviewDestination(
  attempt: ReviewAttempt,
  access: { managesEmployee: boolean; ownsCapability: boolean }
): string | null {
  const query = `?profileId=${attempt.profileId}&attemptId=${attempt.attemptId}`
  if (access.managesEmployee) {
    return `/protected/manager/assessments/${attempt.assessmentId}/review${query}`
  }
  if (access.ownsCapability) {
    return `/protected/capability/${attempt.capabilityId}/assessments/${attempt.assessmentId}/attempt-review${query}`
  }
  return null
}
