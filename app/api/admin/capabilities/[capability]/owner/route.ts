import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { checkOwnerAssignment } from "@/lib/admin/capability-owner"
import { syncOwnerAssignment } from "@/lib/admin/owner-assignment-sync"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ capability: string }>
}

interface Candidate {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
}

/** Active (non-archived) accounts holding the capability-owner role. */
async function loadCandidates(): Promise<Candidate[]> {
  const { data, error } = await getServiceRoleClient()
    .from("profile_roles")
    .select("profiles!inner(id, given_name, last_name, email, status)")
    .eq("profile_role", 3)
    .neq("profiles.status", "inactive")
  if (error) throw new Error(`Failed to load capability owners: ${error.message}`)
  return ((data ?? []) as unknown as { profiles: Candidate | Candidate[] }[])
    .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
    .filter((p): p is Candidate => Boolean(p))
}

async function loadOwnerId(capabilityId: number): Promise<string | null | undefined> {
  const { data, error } = await getServiceRoleClient()
    .from("capabilities")
    .select("owner_id")
    .eq("id", capabilityId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load capability: ${error.message}`)
  return data ? ((data.owner_id as string | null) ?? null) : undefined
}

/** For the Assign owner dialog: the current owner and who can be chosen. */
export async function GET(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const capabilityId = Number((await params).capability)
  if (!Number.isFinite(capabilityId)) return NextResponse.json({ error: "Capability not found." }, { status: 404 })

  try {
    const [ownerId, candidates] = await Promise.all([loadOwnerId(capabilityId), loadCandidates()])
    if (ownerId === undefined) return NextResponse.json({ error: "Capability not found." }, { status: 404 })
    return NextResponse.json({ ownerId, candidates })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Sets (or clears, with null) the capability's owner. Admins only. */
export async function PUT(request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const capabilityId = Number((await params).capability)
  if (!Number.isFinite(capabilityId)) return NextResponse.json({ error: "Capability not found." }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { ownerId?: unknown } | null
  const ownerId = body?.ownerId

  try {
    const [currentOwnerId, candidates] = await Promise.all([loadOwnerId(capabilityId), loadCandidates()])
    if (currentOwnerId === undefined) return NextResponse.json({ error: "Capability not found." }, { status: 404 })

    const guard = checkOwnerAssignment(ownerId, candidates.map((c) => c.id))
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const { error } = await getServiceRoleClient()
      .from("capabilities")
      .update({ owner_id: ownerId as string | null })
      .eq("id", capabilityId)
    if (error) throw new Error(`Failed to set owner: ${error.message}`)

    // Keep the owner's profile_capabilities row in step with owner_id --
    // the invite route does both, and this route previously did only the
    // former, so the two surfaces could disagree about who owned what.
    // See lib/admin/owner-assignment-sync.ts.
    const sync = await syncOwnerAssignment(
      getServiceRoleClient(),
      capabilityId,
      (ownerId as string | null) ?? null,
      currentOwnerId
    )
    if (sync.error) {
      // owner_id is already committed. Report the mismatch rather than
      // pretending it succeeded, so the admin can retry.
      return NextResponse.json({ ownerId, warning: sync.error }, { status: 207 })
    }

    return NextResponse.json({ ownerId })
  } catch (err) {
    return toErrorResponse(err)
  }
}
