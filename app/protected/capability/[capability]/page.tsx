import { CapabilityDetailView } from "@/components/protected/capabilities/capability-detail-view"

interface PageProps {
  params: Promise<{ capability: string }>
}

export default async function CapabilityPage({ params }: PageProps) {
  const { capability: capabilityId } = await params
  return <CapabilityDetailView capabilityId={capabilityId} />
}
