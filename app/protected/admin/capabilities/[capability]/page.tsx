import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { CapabilityDetailView } from "@/components/protected/capabilities/capability-detail-view"
import { loadAllEmployees } from "@/lib/admin/assignment-candidates"

interface PageProps {
  params: Promise<{ capability: string }>
}

export default async function CapabilityPage({ params }: PageProps) {
  const { capability: capabilityId } = await params
  const supabase = createClient(await cookies())
  // Admin scope: every active employee (2026-10-20 manager-assignment
  // design, D3a). Loaded here rather than in the dialog so the manager
  // surface can supply a narrower list from the same component.
  const candidates = await loadAllEmployees(supabase)
  return <CapabilityDetailView capabilityId={capabilityId} canManage candidates={candidates} />
}
