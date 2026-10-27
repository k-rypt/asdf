import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"
import { loadManagerRows } from "@/lib/assessment/load-manager-rows"
import { levelsByCapability, statsByCapability } from "@/lib/assessment/team-stats"
import { TeamStatsCharts } from "@/components/protected/manager/team-stats-charts"

export default async function ManagerStatsPage() {
  const user = await getUser()
  if (!user) {
    // layout.tsx already redirects unauthenticated/non-manager users.
    return null
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const rows = await loadManagerRows(supabase, user.id)

  return <TeamStatsCharts stats={statsByCapability(rows)} levels={levelsByCapability(rows)} />
}
