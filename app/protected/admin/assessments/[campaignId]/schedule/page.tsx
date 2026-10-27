import { cookies } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { CampaignEventCalendar } from "@/components/protected/admin/assessments/campaign-event-calendar"
import { formatDate, cn } from "@/lib/utils"
import {
  ArrowLeft,
  Calendar,
  AlertCircle,
  CalendarDays,
} from "lucide-react"

import { DepartmentSummary } from "@/components/protected/admin/assessments/assign-capability-dialog"

interface PageProps {
  params: Promise<{ campaignId: string }>
}

export default async function CampaignSchedulePage({ params }: PageProps) {
  const { campaignId } = await params
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const [
    { data: campaign, error: campaignError },
    { data: rawCapabilities },
    { data: rawDepartments },
    { data: rawAssignments },
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
          capability_id,
          status,
          duration_minutes,
          passing_score,
          available_from,
          available_until
        )
      `)
      .eq("id", campaignId)
      .single(),
    supabase
      .from("capabilities")
      .select(`
        id,
        name,
        description,
        status,
        assessments (
          id,
          name,
          status,
          duration_minutes,
          passing_score,
          campaign_id
        )
      `)
      .order("name", { ascending: true }),
    supabase
      .from("departments")
      .select("id, name, status, profile_departments(count)")
      .order("name", { ascending: true }),
    supabase
      .from("profile_capabilities")
      .select("capability_id")
      .eq("assignment_type", "assessment"),
  ])

  if (campaignError || !campaign) {
    return (
      <main className="flex justify-center min-h-svh w-full">
        <div className="w-full max-w-6xl mt-5 flex flex-col p-4 lg:p-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
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
              The assessment campaign you are trying to schedule does not exist or may have been deleted.
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

  const normalizedStatus = (campaign.status || "draft").toLowerCase()
  const isActive = normalizedStatus === "active" || normalizedStatus === "published"
  const isArchived = normalizedStatus === "archived" || normalizedStatus === "closed"

  const assessments = Array.isArray(campaign.assessments) ? campaign.assessments : []

  const availableCapabilities = (rawCapabilities || []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    assessments: Array.isArray(c.assessments) ? c.assessments : [],
  }))

  // Map lightweight department summaries with member counts
  const departments: DepartmentSummary[] = (rawDepartments || []).map((dept: any) => ({
    id: dept.id,
    name: dept.name,
    status: dept.status,
    memberCount: dept.profile_departments?.[0]?.count ?? 0,
  }))

  // Group capability assignment counts by capability_id
  const initialAssignmentCounts: Record<number, number> = {}
  for (const row of rawAssignments || []) {
    if (row.capability_id) {
      initialAssignmentCounts[row.capability_id] =
        (initialAssignmentCounts[row.capability_id] || 0) + 1
    }
  }

  return (
    <main className="flex justify-center min-h-svh w-full">
      <div className="w-full max-w-6xl mt-5 flex flex-col gap-6 p-4 lg:p-0">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={`/protected/admin/assessments/${campaign.id}`}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Campaign Details
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Event Calendar</span>
        </div>

        {/* Page Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Badge
                variant={
                  isActive ? "default" : isArchived ? "outline" : "secondary"
                }
                className={
                  isActive
                    ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                    : ""
                }
              >
                {campaign.status
                  ? campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)
                  : "Draft"}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Campaign created {formatDate(campaign.created_at)}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <CalendarDays className="h-7 w-7 text-primary" />
              <span>{campaign.name}: Assessment Schedule</span>
            </h1>

            <p className="text-muted-foreground text-sm">
              Event calendar to organize, configure capabilities, and guarantee non-overlapping assessment time slots.
            </p>
          </div>
        </header>

        {/* The Event Calendar */}
        <CampaignEventCalendar
          campaignId={campaign.id}
          campaignName={campaign.name}
          assessments={assessments}
          allCapabilities={availableCapabilities}
          departments={departments}
          initialAssignmentCounts={initialAssignmentCounts}
        />
      </div>
    </main>
  )
}
