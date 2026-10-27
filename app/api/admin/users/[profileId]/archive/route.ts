import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { checkArchiveAllowed } from "@/lib/admin/account-status"
import { archiveAccount } from "@/lib/admin/archive-account"
import { createAccountDeps, loadArchiveContext, loadInProgressAttempts } from "@/lib/admin/account-deps"

interface RouteParams {
  params: Promise<{ profileId: string }>
}

/** Preview for the confirmation dialog: which assessments the person is taking right now (these block archiving). */
export async function GET(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  try {
    const inProgress = await loadInProgressAttempts(profileId)
    return NextResponse.json({ inProgress })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  try {
    const [context, live] = await Promise.all([loadArchiveContext(profileId), loadInProgressAttempts(profileId)])
    const guard = checkArchiveAllowed({
      callerId: gate.userId,
      targetId: profileId,
      ...context,
      liveAssessmentNames: live.map((a) => a.assessmentName),
    })
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const result = await archiveAccount(createAccountDeps(), profileId)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
