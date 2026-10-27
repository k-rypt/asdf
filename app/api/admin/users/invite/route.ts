// app/api/admin/users/invite/route.ts
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin/require-admin"
import { inviteRedirectUrl } from "@/lib/auth/site-url"
import { createClient } from "@supabase/supabase-js"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

type InvitePayload = {
  givenName: string
  lastName: string
  email: string
  jobTitle?: string
  departmentId?: number
  roleIds: number[]                  // e.g. [2, 4]
  employeeCapabilityIds?: number[]   // capabilities for employee role (assignment_type = 'assessment')
  ownerCapabilityIds?: number[]      // capabilities for capability owner (assignment_type = 'management' + set owner_id)
}

export async function POST(request: Request) {
  // Creates accounts with the service role, so only an admin may call it.
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response


  const body = (await request.json()) as InvitePayload

  // ── Validation ─────────────────────────────────────────────
  if (!body.email || !body.givenName || !body.lastName) {
    return NextResponse.json(
      { error: "Given name, last name, and email are required." },
      { status: 400 }
    )
  }
  if (!body.roleIds?.length) {
    return NextResponse.json(
      { error: "Select at least one role." },
      { status: 400 }
    )
  }

  const roleIdSet = new Set(body.roleIds)

  // Manager (2) requires a department
  if (roleIdSet.has(2) && !body.departmentId) {
    return NextResponse.json(
      { error: "Manager role requires a department." },
      { status: 400 }
    )
  }

  // Capability Owner (3) requires at least one capability
  if (roleIdSet.has(3) && (!body.ownerCapabilityIds || body.ownerCapabilityIds.length === 0)) {
    return NextResponse.json(
      { error: "Capability Owner role requires at least one capability to own." },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()

  // ── 1. Check for duplicate email ───────────────────────────
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", body.email)
    .maybeSingle()

  if (existingProfile) {
    return NextResponse.json(
      { error: "This email is already registered. The user has already been added." },
      { status: 409 }
    )
  }

  // ── 2. Create auth user and send invite email ──────────────
  // The Invite template links through {{ .ConfirmationURL }}, i.e.
  // Supabase's own /auth/v1/verify, which verifies the one-time token and
  // THEN redirects to `redirectTo`. So the session is established by
  // Supabase, and the user lands straight on the set-password page --
  // app/auth/confirm/route.ts is NOT part of this flow.
  //
  // That route still exists, and is still correct, for any template that
  // links to it explicitly with token_hash + type. It is simply not what
  // the default Invite template does. See app/auth/set-password/page.tsx
  // and lib/auth/routing.ts L1-6.
  //
  // `redirectTo` must also appear in Auth > URL Configuration > Redirect
  // URLs, or Supabase ignores it and falls back to the Site URL -- which
  // would strand the user somewhere other than the password form. The base
  // comes from NEXT_PUBLIC_SITE_URL when set, else the request origin; see
  // lib/auth/site-url.ts.
  const { data: authData, error: authError } =
    await supabase.auth.admin.inviteUserByEmail(body.email, {
      data: {
        given_name: body.givenName,
        last_name: body.lastName,
      },
      redirectTo: inviteRedirectUrl(request.url),
    })

  if (authError) {
    // Log the underlying failure: the response below is what the admin
    // sees, and Supabase's own text ("Error sending invite email") says
    // nothing about the cause.
    //
    // The built-in email provider is the usual culprit and has two
    // separate restrictions, neither of which this route can work around:
    // it only DELIVERS to addresses on the project's own team, and it is
    // capped at 2 emails per hour. Custom SMTP (Auth > Emails > SMTP
    // Settings) lifts both and raises the cap to 30/hour by default.
    console.error("inviteUserByEmail failed:", {
      status: authError.status,
      code: authError.code,
      message: authError.message,
    })
    return NextResponse.json(
      {
        error: `The account was not created: the invitation email could not be sent (${authError.message}). Supabase's built-in mailer only delivers to your project's own team and allows 2 emails per hour; configure custom SMTP under Auth > Emails to invite anyone else. See Auth > Logs for the underlying error.`,
      },
      { status: 500 }
    )
  }

  const userId = authData.user.id

  // ── 3. Update profile (handle_new_user trigger created the row with id + email) ─
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      given_name: body.givenName,
      last_name: body.lastName,
      job_title: body.jobTitle ?? null,
      status: false, // false = pending (column is boolean)
    })
    .eq("id", userId)

  if (profileError) {
    console.error("Profile update failed:", profileError)
  }

  // ── 4. Insert profile_roles ────────────────────────────────
  const roleRows = body.roleIds.map((roleId) => ({
    profile_id: userId,
    profile_role: roleId,
  }))

  const { error: rolesError } = await supabase
    .from("profile_roles")
    .insert(roleRows)

  if (rolesError) {
    console.error("Roles insert failed:", rolesError)
  }

  // ── 5. Insert profile_departments ──────────────────────────
  if (body.departmentId) {
    const { error: deptError } = await supabase
      .from("profile_departments")
      .insert({
        profile_id: userId,
        department_id: body.departmentId,
      })

    if (deptError) {
      console.error("Department insert failed:", deptError)
    }
  }

  // ── 6. Insert profile_capabilities ─────────────────────────
  // Employee → assignment_type = 'assessment'
  // Capability Owner → assignment_type = 'management'
  // A user with both roles gets separate records per capability
  // with the correct assignment_type for each.
  const addedAt = new Date().toISOString()
  const capRows: { profile_id: string; capability_id: number; assignment_type: string; added_at: string }[] = []

  if (roleIdSet.has(4) && body.employeeCapabilityIds?.length) {
    for (const capId of body.employeeCapabilityIds) {
      capRows.push({
        profile_id: userId,
        capability_id: capId,
        assignment_type: "assessment",
        added_at: addedAt,
      })
    }
  }

  if (roleIdSet.has(3) && body.ownerCapabilityIds?.length) {
    for (const capId of body.ownerCapabilityIds) {
      // Skip if already added as 'assessment' for the same capability
      // (PK is profile_id + capability_id — can only have one record per capability)
      const alreadyAdded = capRows.some(
        (r) => r.profile_id === userId && r.capability_id === capId
      )
      if (!alreadyAdded) {
        capRows.push({
          profile_id: userId,
          capability_id: capId,
          assignment_type: "management",
          added_at: addedAt,
        })
      }
    }
  }

  if (capRows.length > 0) {
    const { error: capError } = await supabase
      .from("profile_capabilities")
      .insert(capRows)

    if (capError) {
      console.error("Capabilities insert failed:", capError)
    }
  }

  // ── 7. Set owner_id on capabilities for Capability Owner ───
  if (roleIdSet.has(3) && body.ownerCapabilityIds?.length) {
    for (const capId of body.ownerCapabilityIds) {
      const { error: ownerError } = await supabase
        .from("capabilities")
        .update({ owner_id: userId })
        .eq("id", capId)

      if (ownerError) {
        console.error(`Setting owner_id on capability ${capId} failed:`, ownerError)
      }
    }
  }

  return NextResponse.json({
    userId,
    message: "User created and invitation sent successfully.",
  })
}
