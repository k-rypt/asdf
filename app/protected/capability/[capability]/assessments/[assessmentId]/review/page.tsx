import { AssessmentReviewView } from "@/components/protected/capabilities/assessment-review-view"

interface PageProps {
  params: Promise<{ capability: string; assessmentId: string }>
  searchParams: Promise<{ ids?: string }>
}

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { capability: capabilityId, assessmentId } = await params
  const { ids } = await searchParams
  return (
    <AssessmentReviewView
      assessmentId={assessmentId}
      capabilityId={capabilityId}
      backHref={`/protected/capability/${capabilityId}`}
      questionIds={ids?.split(",").filter(Boolean)}
    />
  )
}
