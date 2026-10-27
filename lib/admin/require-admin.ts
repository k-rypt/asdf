import "server-only"
import { NextResponse } from "next/server"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"

/** Admin-only gate for the user archive/reactivate routes -- narrows requireCapabilityAdminClient the same way the preset approve/reject routes do. */
export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx
  if (!ctx.roleNames.includes("admin")) {
    return { ok: false, response: NextResponse.json({ error: "Only admins can manage accounts." }, { status: 403 }) }
  }
  return { ok: true, userId: ctx.user.id }
}
