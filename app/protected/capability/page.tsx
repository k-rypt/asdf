import { CapabilityListView } from "@/components/protected/capabilities/capability-list-view"
import { getUser } from "@/lib/get-user"
import { redirect } from "next/navigation"

export default async function Page() {
  const user = await getUser()

  if (!user) {
    redirect("/auth")
  }

  return <CapabilityListView ownerId={user.id} />
}
