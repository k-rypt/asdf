import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Users, UserCheck, Shield, BookOpen } from "lucide-react"
import { PendingInvitations } from "@/components/protected/admin/users/pending-invitations"
import { InviteUserDialog } from "@/components/protected/admin/users/invite-user-dialog"
import { getUser } from "@/lib/get-user"
import { UsersTable, type UserRow } from "@/components/protected/admin/users/users-table"
import type { ProfileStatus } from "@/lib/admin/account-status"

// -----------------------------------------------------------------
// Stats Cards — server-side data fetching
// -----------------------------------------------------------------
async function getStats() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const [
    { count: totalUsers },
    { count: employees },
    { count: managers },
    { count: capOwners },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .neq("status", "inactive"),
    supabase
      .from("profile_roles")
      .select("*", { count: "exact", head: true })
      .eq("profile_role", 4),
    supabase
      .from("profile_roles")
      .select("*", { count: "exact", head: true })
      .eq("profile_role", 2),
    supabase
      .from("profile_roles")
      .select("*", { count: "exact", head: true })
      .eq("profile_role", 3),
  ])

  return {
    totalUsers: totalUsers ?? 0,
    employees: employees ?? 0,
    managers: managers ?? 0,
    capOwners: capOwners ?? 0,
  }
}

async function getUsers(): Promise<UserRow[]> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const [{ data: profiles }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("id, given_name, last_name, email, status").order("given_name"),
    supabase.from("profile_roles").select("profile_id, roles(name)"),
  ])

  const rolesByProfile = new Map<string, string[]>()
  for (const row of roleRows ?? []) {
    const name = (row.roles as unknown as { name: string } | null)?.name
    if (!name) continue
    const list = rolesByProfile.get(row.profile_id as string) ?? []
    list.push(name)
    rolesByProfile.set(row.profile_id as string, list)
  }

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    name: `${(p.given_name ?? "").trim()} ${(p.last_name ?? "").trim()}`.trim() || (p.email as string),
    email: p.email as string,
    roles: rolesByProfile.get(p.id as string) ?? [],
    status: p.status as ProfileStatus,
  }))
}

const STAT_CARDS = [
  {
    key: "totalUsers" as const,
    title: "Total Users",
    icon: Users,
    description: "Accounts that aren't archived",
  },
  {
    key: "employees" as const,
    title: "Active Employees",
    icon: UserCheck,
    description: "Users with employee role",
  },
  {
    key: "managers" as const,
    title: "Managers",
    icon: Shield,
    description: "Department managers",
  },
  {
    key: "capOwners" as const,
    title: "Capability Owners",
    icon: BookOpen,
    description: "Capability lead roles",
  },
]

// -----------------------------------------------------------------
// Page
// -----------------------------------------------------------------
export default async function AdminUserPage() {
  const [stats, users, currentUser] = await Promise.all([getStats(), getUsers(), getUser()])

  return (
    <main className="flex justify-center min-h-svh w-full">
      <div className="w-full max-w-6xl my-5 flex flex-col space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center w-full">
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        </header>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => (
            <Card key={card.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats[card.key]}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Users Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">All Users</h2>
          <UsersTable users={users} currentUserId={currentUser?.id ?? ""} />
        </div>

        {/* Pending Invitations Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Pending Invitations
            </h2>
            <InviteUserDialog />
          </div>
          <PendingInvitations />
        </div>
      </div>
    </main>
  )
}