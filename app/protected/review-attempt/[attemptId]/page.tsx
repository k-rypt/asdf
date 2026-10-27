import { redirect } from "next/navigation"
import { getUser } from "@/lib/get-user"
import { getUserRoles } from "@/lib/get-user-roles"
import { getServiceRoleClient } from "@/lib/supabase/service-role-client"
import { reviewDestination } from "@/lib/assessment/review-destination"

interface PageProps {
  params: Promise<{ attemptId: string }>
}

/**
 * Target of completed-attempt notifications. Managers and the capability
 * owner are both notified but review from different areas, so this works
 * out which one the reader is for this attempt and redirects. The review
 * page itself re-checks access (RLS / capability scoping); this only
 * picks the door. Service role because the reader's own RLS may not show
 * the attempt or the employee's departments.
 */
export default async function ReviewAttemptRedirect({ params }: PageProps) {
  const { attemptId } = await params
  const user = await getUser()
  if (!user) redirect("/auth")

  const numericAttemptId = Number(attemptId)
  if (!Number.isFinite(numericAttemptId)) return <NotFound />

  const supabase = getServiceRoleClient()
  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, assessment_id, profile_id, assessments(capability_id, capabilities(owner_id))")
    .eq("id", numericAttemptId)
    .eq("status", "completed")
    .maybeSingle()
  if (!attempt) return <NotFound />

  const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments
  const capability = assessment
    ? Array.isArray(assessment.capabilities)
      ? assessment.capabilities[0]
      : assessment.capabilities
    : null
  if (!assessment) return <NotFound />

  const roles = await getUserRoles(user.id)

  let managesEmployee = false
  if (roles.includes(2)) {
    const [{ data: managed }, { data: employeeDepartments }] = await Promise.all([
      supabase.from("profile_departments").select("department_id").eq("profile_id", user.id).eq("status", "management"),
      supabase.from("profile_departments").select("department_id").eq("profile_id", attempt.profile_id),
    ])
    const managedIds = new Set((managed ?? []).map((d) => d.department_id as number))
    managesEmployee = (employeeDepartments ?? []).some((d) => managedIds.has(d.department_id as number))
  }
  const ownsCapability = roles.includes(3) && capability?.owner_id === user.id

  const destination = reviewDestination(
    {
      attemptId: attempt.id as number,
      assessmentId: attempt.assessment_id as number,
      capabilityId: assessment.capability_id as number,
      profileId: attempt.profile_id as string,
    },
    { managesEmployee, ownsCapability }
  )
  if (!destination) return <NotFound />
  redirect(destination)
}

function NotFound() {
  return <p className="p-6 text-muted-foreground">Attempt not found, or you don&apos;t have access to it.</p>
}
