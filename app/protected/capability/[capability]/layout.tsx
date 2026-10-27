import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getUser } from "@/lib/get-user"
import { createClient } from "@/supabase/server"

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ capability: string }>
}

/**
 * The parent layout lets in anyone with the capability-owner role; this
 * narrows every page under /protected/capability/[capability] to the
 * capability's own owner. Admins manage every capability from
 * /protected/admin/capabilities instead.
 */
export default async function CapabilityOwnerLayout({ children, params }: LayoutProps) {
  const user = await getUser()
  if (!user) {
    redirect("/auth")
  }

  const capabilityId = Number((await params).capability)
  if (!Number.isFinite(capabilityId)) notFound()

  const supabase = createClient(await cookies())
  const { data: capability } = await supabase
    .from("capabilities")
    .select("owner_id")
    .eq("id", capabilityId)
    .maybeSingle()
  // Same response whether it doesn't exist or isn't theirs.
  if (!capability || capability.owner_id !== user.id) notFound()

  return <>{children}</>
}
