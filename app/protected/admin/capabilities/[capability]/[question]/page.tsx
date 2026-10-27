import { QuestionDetailView } from "@/components/protected/capabilities/question-detail-view"

interface PageProps {
  params: Promise<{ capability: string; question: string }>
}

export default async function QuestionDetailPage({ params }: PageProps) {
  const { capability: capabilityId, question: questionId } = await params
  return (
    <QuestionDetailView
      questionId={questionId}
      backHref={`/protected/admin/capabilities/${capabilityId}`}
    />
  )
}
