// app/api/invitations/route.ts
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/require-admin"
import { createClient } from "@supabase/supabase-js"

// Server-side only client using the service role key. Never import this
// helper into client components — it bypasses RLS.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

type InvitationPayload = {
  givenName: string
  lastName: string
  email: string
  jobTitle?: string
  roleNames: string[] // e.g. ["Employee", "Manager"]
  departmentId?: number // required for Manager, optional for Employee
  capabilityIds?: number[] // multiple for Employee, exactly one for Capability Lead
}

export async function POST(request: Request) {
  // Creates accounts with the service role, so only an admin may call it.
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response


  const body = (await request.json()) as InvitationPayload

  if (!body.email || !body.givenName || !body.lastName) {
    return NextResponse.json(
      { error: "Given name, last name, and email are required." },
      { status: 400 }
    )
  }
  if (!body.roleNames?.length) {
    return NextResponse.json(
      { error: "Select at least one role." },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()

  // Resolve role names -> ids
  const { data: roles, error: rolesError } = await supabase
    .from("roles")
    .select("id, name")
    .in("name", body.roleNames)

  if (rolesError) {
    return NextResponse.json({ error: rolesError.message }, { status: 500 })
  }
  if (!roles || roles.length !== body.roleNames.length) {
    const found = new Set((roles ?? []).map((r) => r.name))
    const missing = body.roleNames.filter((n) => !found.has(n))
    return NextResponse.json(
      { error: `Unknown role(s): ${missing.join(", ")}` },
      { status: 400 }
    )
  }

  // Business-rule checks that mirror the form's client-side validation —
  // re-checked here because this is the actual trust boundary.
  const roleNameSet = new Set(body.roleNames)
  if (roleNameSet.has("manager") && !body.departmentId) {
    return NextResponse.json(
      { error: "Manager requires a department." },
      { status: 400 }
    )
  }
  if (
    roleNameSet.has("capability owner") &&
    (!body.capabilityIds || body.capabilityIds.length !== 1)
  ) {
    return NextResponse.json(
      { error: "Capability Owner requires exactly one capability." },
      { status: 400 }
    )
  }

  // Insert the invitation
  const { data: invitation, error: insertError } = await supabase
    .from("invitations")
    .insert({
      email: body.email,
      given_name: body.givenName,
      last_name: body.lastName,
      job_title: body.jobTitle ?? null,
      department_id: body.departmentId ?? null,
      assigned_roles: roles.map((r) => r.id),
      status: "pending",
    })
    .select("id, token")
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Attach capabilities, if any
  if (body.capabilityIds?.length) {
    const rows = body.capabilityIds.map((capability_id) => ({
      invitation_id: invitation.id,
      capability_id,
    }))
    const { error: capError } = await supabase
      .from("invitation_capabilities")
      .insert(rows)

    if (capError) {
      return NextResponse.json({ error: capError.message }, { status: 500 })
    }
  }

  // Send the actual invite email. Requires the Supabase project's invite
  // email template + redirect URL to be configured in the dashboard.
  const { error: authError } = await supabase.auth.admin.inviteUserByEmail(
    body.email,
    { data: { invitation_id: invitation.id } }
  )
  if (authError) {
    // The invitation row and assignments are already saved — surface this
    // as a partial failure rather than rolling back, so an admin can resend.
    return NextResponse.json(
      {
        warning: `Invitation saved but the email failed to send: ${authError.message}`,
        invitationId: invitation.id,
      },
      { status: 207 }
    )
  }

  return NextResponse.json({ invitationId: invitation.id, token: invitation.token })
}