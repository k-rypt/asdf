import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { checkReactivateAllowed } from "@/lib/admin/account-status"
import { reactivateAccount } from "@/lib/admin/archive-account"
import { createAccountDeps, loadArchiveContext } from "@/lib/admin/account-deps"

interface RouteParams {
  params: Promise<{ profileId: string }>
}

export async function POST(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  try {
    const { targetStatus } = await loadArchiveContext(profileId)
    const guard = checkReactivateAllowed(targetStatus)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    await reactivateAccount(createAccountDeps(), profileId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
