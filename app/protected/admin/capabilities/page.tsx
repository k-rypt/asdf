import { redirect } from "next/navigation"

import { getUser } from "@/lib/get-user"
import { CapabilityListView } from "@/components/protected/capabilities/capability-list-view"

export default async function AdminCapabilitiesPage() {
    // 1. Verify if user is really logged in, kapag hindi, redirect sa login
    const user = await getUser()

    if (!user) {
        redirect("/auth")
    }

    return <CapabilityListView canCreate />
}
