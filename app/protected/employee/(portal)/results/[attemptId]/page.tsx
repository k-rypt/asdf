import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { ArrowLeft } from "lucide-react"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { loadAttemptDetail } from "@/lib/assessment/attempt-detail"
import { AttemptDetailView } from "@/components/protected/assessment-review/attempt-detail-view"
import { Button } from "@/components/ui/button"

interface PageProps {
  params: Promise<{ attemptId: string }>
}

/**
 * An employee's own results for a completed attempt, after the fact --
 * the end-of-assessment report is only ever built in the browser at
 * completion. Reads back the same attempt_answers the reviewer pages use.
 * Owner and completed status are checked here, not just left to RLS: a
 * user who is also an admin or capability owner can read others' attempts.
 */
export default async function EmployeeResultsPage({ params }: PageProps) {
  const { attemptId } = await params
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const numericAttemptId = Number(attemptId)
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const detail = Number.isFinite(numericAttemptId) ? await loadAttemptDetail(supabase, numericAttemptId) : "not_found"

  const back = (
    <Button
      render={<Link href="/protected/employee/assessments" />}
      nativeButton={false}
      variant="ghost"
      size="sm"
    >
      <ArrowLeft />
      My Assessments
    </Button>
  )

  if (detail === "error") {
    return (
      <div className="p-6 space-y-2">
        {back}
        <p className="text-destructive">Something went wrong loading your results. Please try again.</p>
      </div>
    )
  }
  if (detail === "not_found" || detail.profileId !== user.id || detail.status !== "completed") {
    return (
      <div className="p-6 space-y-2">
        {back}
        <p className="text-muted-foreground">These results don&apos;t exist, or aren&apos;t yours to view.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="max-w-2xl mx-auto px-6 pt-6">{back}</div>
      <AttemptDetailView detail={detail} audience="employee" />
    </div>
  )
}
