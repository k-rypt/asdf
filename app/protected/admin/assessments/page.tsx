import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { CampaignCatalogue } from "@/components/protected/admin/assessments/campaign-catalogue"
import { NewCampaignDialog } from "@/components/protected/admin/assessments/new-campaign-dialog"
import { AssessmentCampaign } from "@/components/protected/admin/assessments/types"

async function getAssessmentCampaigns(): Promise<AssessmentCampaign[]> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data, error } = await supabase
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
        available_from,
        available_until
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching assessment campaigns:", error)
    return []
  }

  return (data || []).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status || "draft",
    created_at: campaign.created_at,
    created_by: campaign.created_by,
    assessmentsCount: Array.isArray(campaign.assessments) ? campaign.assessments.length : 0,
    assessments: campaign.assessments || [],
  }))
}

export default async function AdminAssessmentPage() {
  const campaigns = await getAssessmentCampaigns()

  return (
    <main className="flex justify-center min-h-svh w-full">
      <div className="w-full max-w-6xl mt-5 flex flex-col p-4 lg:p-0">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full mb-2">
          {/* <div>
            <h1 className="text-2xl font-bold tracking-tight">Assessment Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Catalogue of all assessment campaigns and their connected evaluations.
            </p>
          </div> */}
          <NewCampaignDialog />
        </header>

        <CampaignCatalogue campaigns={campaigns} />
      </div>
    </main>
  )
}