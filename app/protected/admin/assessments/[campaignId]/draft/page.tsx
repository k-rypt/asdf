import { cookies } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { buttonVariants } from "@/components/ui/button"
import { DraftAssessmentPage } from "@/components/protected/admin/assessments/draft-assessment-page"
import {
  AssessmentCampaign,
  DepartmentSummaryItem,
} from "@/components/protected/admin/assessments/types"
import { cn } from "@/lib/utils"
import { ArrowLeft, AlertCircle } from "lucide-react"

interface PageProps {
  params: Promise<{ campaignId: string }>
}

export default async function CampaignDraftDynamicPage({ params }: PageProps) {
  const { campaignId } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const numericCampaignId = parseInt(campaignId, 10)
  if (isNaN(numericCampaignId)) {
    notFound()
  }

  const [
    { data: rawCampaign, error: campaignError },
    { data: rawCapabilities },
    { data: rawDepartments },
  ] = await Promise.all([
    supabase
      .from("assessment_campaigns")
      .select(`
        id,
        name,
        description,
        status,
        created_at,
        created_by,
        assessments (
          id,
          name,
          status,
          capability_id,
          duration_minutes,
          passing_score,
          available_from,
          available_until,
          created_at
        )
      `)
      .eq("id", numericCampaignId)
      .single(),
    supabase
      .from("capabilities")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("departments")
      .select("id, name, profile_departments(count)")
      .order("name", { ascending: true }),
  ])

  if (campaignError || !rawCampaign) {
    return (
      <main className="flex justify-center min-h-svh w-full">
        <div className="w-full max-w-6xl mt-5 flex flex-col p-4 lg:p-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link
              href="/protected/admin/assessments"
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Assessment Campaigns
            </Link>
          </div>

          <div className="min-h-[300px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-muted/10">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
            <h2 className="text-xl font-bold">Campaign Not Found</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              The draft assessment you are looking for does not exist or may have been deleted.
            </p>
            <Link
              href="/protected/admin/assessments"
              className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
            >
              Back to Campaigns
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const capabilityMap = new Map((rawCapabilities || []).map((c) => [c.id, c.name]))
  const rawAssessmentsList = Array.isArray(rawCampaign.assessments) ? rawCampaign.assessments : []
  const assessments = rawAssessmentsList.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    capability_id: a.capability_id,
    capability_name: a.capability_id ? capabilityMap.get(a.capability_id) || null : null,
    duration_minutes: a.duration_minutes,
    passing_score: a.passing_score,
    available_from: a.available_from,
    available_until: a.available_until,
    created_at: a.created_at,
  }))

  const campaign: AssessmentCampaign = {
    id: rawCampaign.id,
    name: rawCampaign.name,
    description: rawCampaign.description,
    status: rawCampaign.status || "draft",
    created_at: rawCampaign.created_at,
    created_by: rawCampaign.created_by,
    assessmentsCount: assessments.length,
    assessments,
  }

  const departments: DepartmentSummaryItem[] = (rawDepartments || []).map((d) => {
    const countArr = d.profile_departments as unknown as { count: number }[]
    const memberCount = Array.isArray(countArr) && countArr.length > 0 ? countArr[0].count : 0
    return {
      id: d.id,
      name: d.name,
      memberCount,
    }
  })

  return (
    <DraftAssessmentPage
      campaign={campaign}
      departments={departments}
      allCapabilities={rawCapabilities || []}
    />
  )
}
