import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { ManagerDashboardClient } from "@/components/protected/manager/manager-dashboard-client"
import { loadManagerRows } from "@/lib/assessment/load-manager-rows"

export default async function ManagerPage() {
  const user = await getUser()
  if (!user) {
    // layout.tsx already redirects unauthenticated/non-manager users
    // before this renders -- this is just a type-narrowing guard.
    return null
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const rows = await loadManagerRows(supabase, user.id)

  return <ManagerDashboardClient rows={rows} detailHrefBase="/protected/manager/assessments" />
}
