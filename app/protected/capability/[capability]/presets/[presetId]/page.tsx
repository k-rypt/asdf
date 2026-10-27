import { PresetDetailView } from "@/components/protected/capabilities/preset-detail-view"

interface PageProps {
  params: Promise<{ capability: string; presetId: string }>
}

export default async function CapabilityOwnerPresetDetailPage({ params }: PageProps) {
  const { capability: capabilityId, presetId } = await params
  return (
    <PresetDetailView
      capabilityId={capabilityId}
      presetId={presetId}
      backHref={`/protected/capability/${capabilityId}`}
      canManage={false}
    />
  )
}
