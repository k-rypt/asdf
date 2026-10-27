import { QuestionPoolView } from "@/components/protected/capabilities/question-pool-view"

interface PageProps {
  params: Promise<{ capability: string }>
}

export default async function QuestionPoolPage({ params }: PageProps) {
  const { capability: capabilityId } = await params
  return <QuestionPoolView capabilityId={capabilityId} backHref={`/protected/admin/capabilities/${capabilityId}`} />
}
