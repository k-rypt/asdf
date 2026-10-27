import { NextResponse } from "next/server"
import { toErrorResponse } from "@/lib/assessment/api-error"
import { requireAdmin } from "@/lib/admin/require-admin"
import { isArchived } from "@/lib/admin/account-status"
import { parseProfileDetails } from "@/lib/admin/profile-details"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"

interface RouteParams {
  params: Promise<{ profileId: string }>
}

/** For the Edit details dialog: the person's current name and job title. */
export async function GET(_request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  try {
    const { data, error } = await getServiceRoleClient()
      .from("profiles")
      .select("given_name, last_name, job_title")
      .eq("id", profileId)
      .maybeSingle()
    if (error) throw new Error(`Failed to load details: ${error.message}`)
    if (!data) return NextResponse.json({ error: "This account no longer exists." }, { status: 404 })
    return NextResponse.json({
      givenName: data.given_name ?? "",
      lastName: data.last_name ?? "",
      jobTitle: data.job_title ?? "",
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** Sets the person's first name, last name and job title. Status is left alone. */
export async function PUT(request: Request, { params }: RouteParams) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.response
  const { profileId } = await params

  const parsed = parseProfileDetails(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const supabase = getServiceRoleClient()
    const { data: profile, error: loadError } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", profileId)
      .maybeSingle()
    if (loadError) throw new Error(`Failed to load account: ${loadError.message}`)
    if (!profile) return NextResponse.json({ error: "This account no longer exists." }, { status: 404 })
    if (isArchived(profile.status)) {
      return NextResponse.json({ error: "Reactivate this account before editing its details." }, { status: 409 })
    }

    const { givenName, lastName, jobTitle } = parsed.details
    const { error } = await supabase
      .from("profiles")
      .update({ given_name: givenName, last_name: lastName, job_title: jobTitle })
      .eq("id", profileId)
    if (error) throw new Error(`Failed to save details: ${error.message}`)

    return NextResponse.json(parsed.details)
  } catch (err) {
    return toErrorResponse(err)
  }
}
