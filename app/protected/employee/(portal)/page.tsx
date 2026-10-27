import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { loadEmployeeRows } from "@/lib/assessment/load-employee-rows"
import { summarizeEmployeeRows } from "@/lib/assessment/employee-dashboard-summary"
import { EmployeeDashboard } from "@/components/protected/employee/employee-dashboard"

export default async function EmployeePage() {
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { profile, rows, asOf } = await loadEmployeeRows(supabase, user.id)

  return (
    <EmployeeDashboard
      givenName={profile?.given_name ?? null}
      summary={summarizeEmployeeRows(rows)}
      now={asOf}
    />
  )
}
