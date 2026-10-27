import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { loadEmployeeRows } from "@/lib/assessment/load-employee-rows"
import { EmployeeAssessmentsClient } from "@/components/protected/employee/employee-assessments-client"

export default async function EmployeeAssessmentsPage() {
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { rows } = await loadEmployeeRows(supabase, user.id)

  return <EmployeeAssessmentsClient rows={rows} />
}
