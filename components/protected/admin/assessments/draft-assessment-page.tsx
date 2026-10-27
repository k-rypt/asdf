"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AssessmentCampaign, DepartmentSummaryItem } from "./types"
import { DurationEditor } from "./duration-editor"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/toast"
import { formatDate, cn } from "@/lib/utils"
import {
  detectScheduleConflicts,
  canLaunchCampaign,
  isAssessmentApproved,
  findDuplicateCapabilityIds,
  checkScheduleTimeliness,
} from "@/lib/assessment/schedule-conflicts"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  FileQuestion,
  Rocket,
  Edit3,
  CalendarDays,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Users,
  Layers,
  Sparkles,
  Loader2,
  ExternalLink,
  ClipboardList,
} from "lucide-react"

/** Helper to split date into date & time parts with JetBrains Mono styling, matching CampaignCard */
function formatDateTimeParts(dateStr?: string | null) {
  if (!dateStr) {
    return { datePart: "Not set", timePart: "--:--" }
  }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) {
    return { datePart: "Invalid date", timePart: "--:--" }
  }
  return {
    datePart: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d),
    timePart: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d),
  }
}

interface DraftAssessmentPageProps {
  campaign: AssessmentCampaign
  departments?: DepartmentSummaryItem[]
  allCapabilities?: Array<{ id: number; name: string }>
}

export function DraftAssessmentPage({
  campaign,
  departments = [],
  allCapabilities = [],
}: DraftAssessmentPageProps) {
  const router = useRouter()
  const [isLaunchDialogOpen, setIsLaunchDialogOpen] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [isShiftingSchedules, setIsShiftingSchedules] = useState(false)

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editName, setEditName] = useState(campaign.name)
  const [editDescription, setEditDescription] = useState(campaign.description || "")

  const assessments = campaign.assessments || []

  // Aggregate schedule window across assessments
  const { startDate, endDate, hasSchedule } = useMemo(() => {
    const starts = assessments
      .map((a) => (a.available_from ? new Date(a.available_from).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))
    const ends = assessments
      .map((a) => (a.available_until ? new Date(a.available_until).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))

    if (starts.length === 0 || ends.length === 0) {
      return { startDate: "Not scheduled", endDate: "Not scheduled", hasSchedule: false }
    }

    const minStart = new Date(Math.min(...starts))
    const maxEnd = new Date(Math.max(...ends))

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d)

    return {
      startDate: fmt(minStart),
      endDate: fmt(maxEnd),
      hasSchedule: true,
    }
  }, [assessments])

  // Total duration in minutes
  const totalDuration = useMemo(() => {
    return assessments.reduce((acc, a) => acc + (a.duration_minutes || 0), 0)
  }, [assessments])

  // Schedule conflict detection: two assessments conflict if their availability windows overlap
  // Overlap condition: startA < endB && endA > startB
  const { conflicts, conflictIdSet, hasConflicts } = useMemo(() => {
    return detectScheduleConflicts(assessments)
  }, [assessments])

  // Pre-launch readiness checklist
  const readinessChecklist = useMemo(() => {
    const hasName = Boolean(campaign.name.trim())
    const hasAssessments = assessments.length > 0
    const hasSchedules = assessments.some((a) => Boolean(a.available_from && a.available_until))
    const hasPassingCriteria = assessments.length > 0 && assessments.every((a) => a.passing_score !== null && a.passing_score !== undefined)

    const allApproved = assessments.length > 0 && assessments.every((a) => isAssessmentApproved(a.status))
    const unapprovedModules = assessments.filter((a) => !isAssessmentApproved(a.status))
    const duplicateCapIds = findDuplicateCapabilityIds(assessments)
    const hasDuplicateCapabilities = duplicateCapIds.length > 0
    const timeliness = checkScheduleTimeliness(assessments)

    const items = [
      {
        id: "created",
        title: "Campaign Info Configured",
        description: "Title and description established.",
        done: hasName,
      },
      {
        id: "assessments",
        title: "Assessments Connected",
        description: `${assessments.length} assessment modules attached.`,
        done: hasAssessments,
      },
      {
        id: "approved",
        title: "Modules Approved",
        description: allApproved
          ? "All connected modules are approved."
          : `${unapprovedModules.length} module${unapprovedModules.length === 1 ? "" : "s"} require approval.`,
        done: allApproved,
      },
      {
        id: "schedule",
        title: "Availability Window Set",
        description: hasSchedules
          ? `Earliest start: ${startDate}`
          : "Assign schedule windows in the calendar.",
        done: hasSchedules,
      },
      {
        id: "timeliness",
        title: "Schedule Up-to-Date",
        description: timeliness.hasExpired
          ? `${timeliness.expiredAssessments.length} module schedule${timeliness.expiredAssessments.length > 1 ? "s have" : " has"} ended in the past.`
          : timeliness.hasPartiallyElapsed
          ? `${timeliness.partiallyElapsedAssessments.length} module window has partially started.`
          : hasSchedules
          ? "All scheduled windows are current or upcoming."
          : "Schedule windows pending.",
        done: !timeliness.hasExpired && hasSchedules,
      },
      {
        id: "criteria",
        title: "Passing Criteria Defined",
        description: hasPassingCriteria
          ? "All assessments have passing score thresholds."
          : "Check passing scores for connected modules.",
        done: hasPassingCriteria,
      },
      {
        id: "conflicts",
        title: "Conflict-Free Schedule",
        description: !hasConflicts
          ? "Zero schedule collisions detected."
          : `${conflicts.length} time collision${conflicts.length > 1 ? "s" : ""} detected. Resolve before launch.`,
        done: !hasConflicts,
      },
    ]

    const completedCount = items.filter((i) => i.done).length
    const isReady =
      completedCount === items.length &&
      !hasConflicts &&
      allApproved &&
      !hasDuplicateCapabilities &&
      !timeliness.hasExpired

    return {
      items,
      completedCount,
      isReady,
      allApproved,
      unapprovedModules,
      hasDuplicateCapabilities,
      timeliness,
    }
  }, [campaign.name, assessments, startDate, hasConflicts, conflicts.length])

  // Handler to activate / launch the campaign
  const handleLaunchCampaign = async () => {
    // Hard block if any conflict exists or requirements not met
    const launchCheck = canLaunchCampaign(
      hasConflicts,
      readinessChecklist.isReady,
      readinessChecklist.allApproved,
      readinessChecklist.hasDuplicateCapabilities,
      readinessChecklist.timeliness.hasExpired
    )
    if (!launchCheck.canLaunch) {
      toast.add({
        title: "Launch Blocked",
        description: launchCheck.reason || "Cannot launch campaign.",
        type: "error",
      })
      return
    }

    setIsLaunching(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("assessment_campaigns")
        .update({ status: "active" })
        .eq("id", campaign.id)

      if (error) throw error

      toast.add({
        title: "Campaign Launched",
        description: `"${campaign.name}" is now live and active.`,
        type: "success",
      })

      setIsLaunchDialogOpen(false)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch campaign."
      console.error("Error launching campaign:", err)
      toast.add({ title: "Launch Failed", description: msg, type: "error" })
    } finally {
      setIsLaunching(false)
    }
  }

  // Handler to save edited title and description
  const handleSaveDetails = async () => {
    if (!editName.trim()) return
    setIsSavingEdit(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("assessment_campaigns")
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq("id", campaign.id)

      if (error) throw error

      toast.add({
        title: "Details Updated",
        description: "Campaign information updated successfully.",
        type: "success",
      })

      setIsEditDialogOpen(false)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update details."
      console.error("Error updating campaign details:", err)
      toast.add({ title: "Error", description: msg, type: "error" })
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handler to auto-shift all schedules forward to start from today
  const handleShiftSchedules = async () => {
    setIsShiftingSchedules(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStartTime: new Date().toISOString() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to shift schedules.")
      }

      const data = await res.json()
      toast.add({
        title: "Schedules Shifted Forward",
        description: `Successfully shifted ${data.shiftedCount} module schedules forward to start from now.`,
        type: "success",
      })

      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to shift schedules."
      console.error("Error shifting schedules:", err)
      toast.add({ title: "Shift Failed", description: msg, type: "error" })
    } finally {
      setIsShiftingSchedules(false)
    }
  }

  return (
    <main className="flex justify-center min-h-svh w-full pb-16">
      <div className="w-full max-w-6xl mt-5 flex flex-col gap-6 p-4 lg:p-0">
        {/* Navigation & Header Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Link
            href="/protected/admin/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Assessment Campaigns
          </Link>

          {/* Mode Switcher / Preview Helper */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">View Mode:</span>
            <div className="inline-flex items-center rounded-md border border-card-foreground/40 bg-muted/40 p-0.5 text-xs">
              <span className="px-2.5 py-1 font-medium bg-background text-foreground rounded-sm shadow-xs">
                Draft View
              </span>
              <Link
                href={`/protected/admin/assessments/${campaign.id}?view=active`}
                className="px-2.5 py-1 text-muted-foreground hover:text-foreground rounded-sm transition-colors flex items-center gap-1"
              >
                <span>Active View</span>
                <span className="text-[10px] text-muted-foreground">(preview)</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Campaign Header - styled with catalogue border-2 border-card-foreground/40 rounded-md */}
        <header className="rounded-md border-2 border-card-foreground/40 bg-card p-5 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center gap-2.5">
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium rounded-md"
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  Draft Assessment
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-['JetBrains_Mono',monospace]">
                  <Calendar className="h-3.5 w-3.5" />
                  Created {formatDate(campaign.created_at)}
                </span>
              </div>

              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                {campaign.name}
              </h1>

              {campaign.description ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {campaign.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/60">
                  No description provided for this draft campaign.
                </p>
              )}
            </div>

            {/* Quick Header Actions */}
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditDialogOpen(true)}
                className="gap-1.5 h-9 text-xs rounded-md"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit Details
              </Button>

              <Link
                href={`/protected/admin/assessments/${campaign.id}/schedule`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 h-9 text-xs rounded-md")}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Schedule
              </Link>

              <Button
                variant={hasConflicts ? "outline" : "default"}
                size="sm"
                disabled={hasConflicts || !readinessChecklist.isReady}
                onClick={() => setIsLaunchDialogOpen(true)}
                className={cn(
                  "gap-1.5 h-9 text-xs font-medium rounded-md transition-colors",
                  hasConflicts
                    ? "border-destructive/40 text-destructive bg-destructive/10 hover:bg-destructive/15 cursor-not-allowed opacity-90"
                    : readinessChecklist.isReady
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "opacity-70 cursor-not-allowed"
                )}
                title={
                  hasConflicts
                    ? "Launch blocked: resolve schedule conflicts before launching"
                    : !readinessChecklist.isReady
                    ? "Complete readiness checklist to launch"
                    : "Launch campaign"
                }
              >
                <Rocket className="h-3.5 w-3.5" />
                {hasConflicts ? "Launch Blocked" : "Launch Campaign"}
              </Button>
            </div>
          </div>

          {/* Pre-launch Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Draft Stage:</strong> This assessment campaign is in preparation. It will not be visible to employees until launched.
              </span>
            </div>
            <span
              className={cn(
                "font-medium shrink-0 ml-2 font-['JetBrains_Mono',monospace]",
                hasConflicts
                  ? "text-destructive font-semibold"
                  : "text-amber-800 dark:text-amber-400"
              )}
            >
              {readinessChecklist.completedCount} of {readinessChecklist.items.length} steps ready
            </span>
          </div>
        </header>

        {/* Schedule Conflict Alert Banner - Launch Blocking */}
        {hasConflicts && (
          <div className="p-4 rounded-md border-2 border-destructive/40 bg-destructive/10 text-destructive flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">
                    Launch Blocked: Schedule Conflicts Detected ({conflicts.length})
                  </h4>
                  <Badge variant="destructive" className="text-[10px] uppercase tracking-wider py-0 px-1.5 rounded-md">
                    Action Required
                  </Badge>
                </div>
                <p className="text-xs text-destructive/90 leading-relaxed">
                  This campaign cannot be launched while assessment schedule windows overlap. Resolve the following collisions in the schedule calendar before proceeding:
                </p>
                <ul className="text-xs list-disc list-inside space-y-0.5 mt-1 text-destructive/95 font-medium">
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      <span>{c.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Link
              href={`/protected/admin/assessments/${campaign.id}/schedule`}
              className={cn(
                buttonVariants({ variant: "destructive", size: "sm" }),
                "gap-1.5 text-xs shrink-0 self-start sm:self-center rounded-md"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Resolve in Calendar
            </Link>
          </div>
        )}

        {/* Duplicate Capabilities Alert Banner - Launch Blocking */}
        {readinessChecklist.hasDuplicateCapabilities && (
          <div className="p-4 rounded-md border-2 border-destructive/40 bg-destructive/10 text-destructive flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">
                    Launch Blocked: Duplicate Capability Assessments
                  </h4>
                  <Badge variant="destructive" className="text-[10px] uppercase tracking-wider py-0 px-1.5 rounded-md">
                    One Per Capability
                  </Badge>
                </div>
                <p className="text-xs text-destructive/90 leading-relaxed">
                  Multiple assessment modules are attached to the same capability. A capability assessment can only be applied once per campaign. Unlink redundant modules to proceed.
                </p>
              </div>
            </div>
            <Link
              href={`/protected/admin/assessments/${campaign.id}/schedule`}
              className={cn(
                buttonVariants({ variant: "destructive", size: "sm" }),
                "gap-1.5 text-xs shrink-0 self-start sm:self-center rounded-md"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Manage Capabilities
            </Link>
          </div>
        )}

        {/* Unapproved Modules Alert Banner - Launch Blocking */}
        {!readinessChecklist.allApproved && assessments.length > 0 && (
          <div className="p-4 rounded-md border-2 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300 flex flex-col sm:flex-row sm:items-start justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">
                    Launch Blocked: Unapproved Assessment Modules ({readinessChecklist.unapprovedModules.length})
                  </h4>
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] uppercase tracking-wider py-0 px-1.5 rounded-md">
                    Approval Required
                  </Badge>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  Only approved assessment modules can be included in an active campaign. The following modules must be approved before this campaign can be launched:
                </p>
                <ul className="text-xs list-disc list-inside space-y-0.5 mt-1 text-amber-900 dark:text-amber-200 font-medium">
                  {readinessChecklist.unapprovedModules.map((m) => (
                    <li key={m.id}>
                      <span>{m.name} ({m.capability_name || "Assessment"}) — Status: {m.status || "draft"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Link
              href={`/protected/admin/assessments/${campaign.id}/schedule`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 text-xs shrink-0 self-start sm:self-center rounded-md border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Manage in Scheduler
            </Link>
          </div>
        )}

        {/* Expired Schedules Alert Banner - Launch Blocking with Auto-Shift Action */}
        {readinessChecklist.timeliness.hasExpired && (
          <div className="p-4 rounded-md border-2 border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">
                    Launch Blocked: Assessment Schedule Window Expired
                  </h4>
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/20 text-amber-900 dark:text-amber-200 text-[10px] uppercase tracking-wider py-0 px-1.5 rounded-md"
                  >
                    Expired Windows
                  </Badge>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  One or more assessment module availability windows have already passed. Employees cannot take assessments whose deadlines ended in the past.
                </p>
                <ul className="text-xs list-disc list-inside space-y-0.5 mt-1 text-amber-900 dark:text-amber-200 font-medium">
                  {readinessChecklist.timeliness.expiredAssessments.map((a) => (
                    <li key={a.id}>
                      <span>{a.name} (ended {formatDate(a.available_until!, true)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-col items-stretch gap-2 shrink-0 self-start sm:self-center">
              <Button
                size="sm"
                onClick={handleShiftSchedules}
                disabled={isShiftingSchedules}
                className="gap-1.5 text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {isShiftingSchedules ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                Shift Schedules to Start Now
              </Button>
              <Link
                href={`/protected/admin/assessments/${campaign.id}/schedule`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-1.5 text-xs h-8 border-amber-500/40 hover:bg-amber-500/20"
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Adjust in Calendar
              </Link>
            </div>
          </div>
        )}

        {/* Quick Insights Strip - matching Campaign Catalogue Insight cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                <Layers className="h-3 w-3 mr-1" />
                Connected Modules
              </div>
              <div className="text-xl font-medium mt-2 font-['JetBrains_Mono',monospace]">
                {assessments.length}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                <Clock className="h-3 w-3 mr-1 text-amber-600" />
                Estimated Duration
              </div>
              <div className="text-xl font-medium mt-2 font-['JetBrains_Mono',monospace]">
                {totalDuration > 0 ? `${totalDuration} mins` : "Untimed"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                <Calendar className="h-3 w-3 mr-1 text-blue-600" />
                Schedule Window
              </div>
              <div className="text-xs sm:text-sm font-medium mt-2 truncate font-['JetBrains_Mono',monospace]">
                {hasSchedule ? `${startDate} – ${endDate}` : "Pending Setup"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                <Users className="h-3 w-3 mr-1 text-emerald-600" />
                Target Departments
              </div>
              <div className="text-xl font-medium mt-2 font-['JetBrains_Mono',monospace]">
                {departments.length}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Container - signature catalogue style: border-2 border-card-foreground/40 rounded-md bg-muted/50 p-5 */}
        <div className="border-2 border-card-foreground/40 rounded-md bg-muted/50 p-5 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b pb-3">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Draft Campaign Configuration
            </h1>
            <Badge
              variant={readinessChecklist.isReady ? "default" : hasConflicts ? "destructive" : "secondary"}
              className={cn("rounded-md", readinessChecklist.isReady ? "bg-emerald-600 text-white" : "")}
            >
              {hasConflicts
                ? "Conflicts Detected (Blocked)"
                : readinessChecklist.isReady
                ? "Ready to Launch"
                : "In Progress"}
            </Badge>
          </div>

          {/* Readiness Checklist Stepper */}
          <section className="rounded-md border border-card-foreground/30 bg-card p-5 space-y-4">
            <div>
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Launch Readiness Checklist
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete all requirements below before publishing this campaign.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
              {readinessChecklist.items.map((step, idx) => {
                const isConflictStep = step.id === "conflicts"
                const isApprovalStep = step.id === "approved"
                const isConflictBlocked = isConflictStep && !step.done
                const isApprovalBlocked = isApprovalStep && !step.done

                return (
                  <div
                    key={step.id}
                    className={cn(
                      "p-3 rounded-md border transition-colors flex items-start gap-2.5",
                      isConflictBlocked
                        ? "bg-destructive/10 border-destructive/40 text-destructive"
                        : isApprovalBlocked
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300"
                        : step.done
                        ? "bg-emerald-500/5 border-emerald-500/30 text-card-foreground"
                        : "bg-muted/30 border-dashed text-muted-foreground"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isConflictBlocked ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : isApprovalBlocked ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      ) : step.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div
                        className={cn(
                          "text-xs font-semibold flex items-center gap-1",
                          isConflictBlocked ? "text-destructive" : "text-foreground"
                        )}
                      >
                        <span>{idx + 1}.</span>
                        <span className="truncate">{step.title}</span>
                      </div>
                      <p
                        className={cn(
                          "text-[11px] leading-snug",
                          isConflictBlocked ? "text-destructive/90" : "text-muted-foreground"
                        )}
                      >
                        {step.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Connected Assessments (Draft Modules List) */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Connected Assessments ({assessments.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Assessments queued to be published once this campaign is launched.
                </p>
              </div>
              <Link
                href={`/protected/admin/assessments/${campaign.id}/schedule`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs h-9 rounded-md")}
              >
                <CalendarDays className="h-4 w-4" />
                Manage & Schedule Modules
              </Link>
            </div>

            {assessments.length === 0 ? (
              <div className="min-h-[220px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-card-foreground/30 rounded-md bg-card/60">
                <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground">
                  <FileQuestion className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  No assessments connected to this draft yet
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mb-4">
                  Add capability assessments to this campaign using the scheduler. Once linked, you can set their schedule windows and launch the campaign.
                </p>
                <Link
                  href={`/protected/admin/assessments/${campaign.id}/schedule`}
                  className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5 rounded-md")}
                >
                  <CalendarDays className="h-4 w-4" />
                  Connect Capabilities & Schedule
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assessments.map((assessment) => {
                  const hasTime = Boolean(assessment.available_from && assessment.available_until)
                  const hasConflict = conflictIdSet.has(assessment.id)
                  const fromParts = formatDateTimeParts(assessment.available_from)
                  const untilParts = formatDateTimeParts(assessment.available_until)

                  return (
                    <Card
                      key={assessment.id}
                      className={cn(
                        "group relative flex flex-col justify-between h-full transition-all duration-200 rounded-md border border-card-foreground/40 ring-0 p-0 bg-card hover:border-card-foreground/60",
                        hasConflict && "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/30"
                      )}
                    >
                      <div>
                        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0 gap-2">
                          <CardTitle className="text-normal tracking-tight text-foreground line-clamp-2">
                            {assessment.name}
                          </CardTitle>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasConflict && (
                              <Badge
                                variant="destructive"
                                className="text-[11px] gap-1 font-medium rounded-md"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Conflict
                              </Badge>
                            )}
                            {isAssessmentApproved(assessment.status) ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] capitalize shrink-0 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium"
                              >
                                Approved
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[11px] shrink-0 rounded-md border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Approval Required
                              </Badge>
                            )}
                          </div>
                        </CardHeader>

                        <CardFooter className="space-y-4 p-0 flex-col">
                          <div className="w-full p-4 mb-0 flex flex-col gap-3">
                            {/* Connected Assessment Metadata Box - matching CampaignCard */}
                            <div className="rounded-lg border bg-muted p-3 flex items-center justify-between w-full">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                  <ClipboardList className="h-4 w-4" />
                                </div>
                                <div>
                                  <div className="text-sm font-medium leading-none text-foreground truncate max-w-[220px]">
                                    {assessment.capability_name || "Capability Assessment"}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                    <DurationEditor assessmentId={assessment.id} minutes={assessment.duration_minutes} />
                                    <span>•</span>
                                    <span>Pass: {assessment.passing_score ?? 70}%</span>
                                  </div>
                                </div>
                              </div>
                              <Layers className="h-4 w-4 text-muted-foreground/50" />
                            </div>

                            {/* Schedule Window Start & End Columns - matching CampaignCard style */}
                            <div className="w-full flex justify-between px-2 text-xs">
                              <div>
                                <p className="text-muted-foreground">Start</p>
                                <h1 className="text-xs font-semibold text-foreground tracking-tight font-['JetBrains_Mono',monospace]">
                                  {fromParts.datePart}
                                </h1>
                                <p className="text-muted-foreground font-['JetBrains_Mono',monospace]">
                                  {fromParts.timePart}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-muted-foreground">End</p>
                                <h1 className="text-xs font-semibold text-foreground tracking-tight font-['JetBrains_Mono',monospace]">
                                  {untilParts.datePart}
                                </h1>
                                <p className="text-muted-foreground font-['JetBrains_Mono',monospace]">
                                  {untilParts.timePart}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Bottom Strip - matching CampaignCard last updated / metadata footer */}
                          <div
                            className={cn(
                              "px-4 py-2 border-t bg-muted flex items-center justify-between w-full rounded-b-md text-xs",
                              hasConflict && "bg-destructive/10 text-destructive border-destructive/30"
                            )}
                          >
                            <span className="text-muted-foreground">
                              {hasTime ? "Scheduled Window" : "Unscheduled"}
                            </span>
                            {hasConflict ? (
                              <span className="font-semibold text-destructive flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Schedule Overlap
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-['JetBrains_Mono',monospace]">
                                ID #{assessment.id}
                              </span>
                            )}
                          </div>
                        </CardFooter>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {/* Target Departments Overview */}
          {departments.length > 0 && (
            <section className="rounded-md border border-card-foreground/30 bg-card p-5 space-y-4">
              <div>
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Target Departments ({departments.length})
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Employees in these departments will receive access to this assessment campaign.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="p-3 rounded-md border border-card-foreground/30 bg-muted/30 flex items-center justify-between text-xs"
                  >
                    <div className="font-medium text-foreground truncate">{dept.name}</div>
                    <Badge variant="secondary" className="shrink-0 text-[11px] rounded-md">
                      {dept.memberCount} members
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Launch Confirmation Dialog */}
        <Dialog open={isLaunchDialogOpen} onOpenChange={setIsLaunchDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-emerald-600" />
                Launch Assessment Campaign?
              </DialogTitle>
              <DialogDescription>
                Activating &ldquo;<span className="font-semibold text-foreground">{campaign.name}</span>&rdquo; will transition its status to <strong>Active</strong>. Scheduled assessments will become accessible to assigned employees according to their set calendar windows.
              </DialogDescription>
            </DialogHeader>

            <div className="py-2 space-y-3 text-xs">
              {readinessChecklist.timeliness.hasExpired && (
                <div className="p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Cannot Launch: Schedule Windows Expired</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {readinessChecklist.timeliness.expiredAssessments.length} assessment module window{readinessChecklist.timeliness.expiredAssessments.length > 1 ? "s have" : " has"} ended in the past. Shift schedules forward to make them available now.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleShiftSchedules}
                    disabled={isShiftingSchedules}
                    className="w-full text-xs h-8 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  >
                    {isShiftingSchedules ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    Shift Schedules to Start Now
                  </Button>
                </div>
              )}

              {hasConflicts && (
                <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <span>Cannot Launch: Schedule Conflicts Exist</span>
                  </div>
                  <p className="text-[11px] text-destructive/90 leading-relaxed">
                    This campaign cannot be launched because {conflicts.length} schedule conflict{conflicts.length > 1 ? "s" : ""} were detected between connected modules. Please resolve the time collisions before launching.
                  </p>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5 font-medium">
                    {conflicts.map((c, i) => (
                      <li key={i}>{c.message}</li>
                    ))}
                  </ul>
                  <div className="pt-1">
                    <Link
                      href={`/protected/admin/assessments/${campaign.id}/schedule`}
                      className={cn(buttonVariants({ variant: "destructive", size: "sm" }), "w-full text-xs h-8 gap-1.5")}
                      onClick={() => setIsLaunchDialogOpen(false)}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      Open Schedule to Fix Conflicts
                    </Link>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg border bg-muted/40 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connected Assessments:</span>
                  <span className="font-medium">{assessments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Availability Window:</span>
                  <span className="font-medium font-['JetBrains_Mono',monospace]">
                    {hasSchedule ? `${startDate} – ${endDate}` : "Unscheduled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Conflict Status:</span>
                  <span
                    className={cn(
                      "font-medium",
                      hasConflicts ? "text-destructive font-semibold" : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {hasConflicts ? `${conflicts.length} Collision(s) Detected` : "Conflict-Free"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approval Status:</span>
                  <span
                    className={cn(
                      "font-medium",
                      !readinessChecklist.allApproved ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {readinessChecklist.allApproved ? "All Modules Approved" : "Approval Required"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Schedule Timeliness:</span>
                  <span
                    className={cn(
                      "font-medium",
                      readinessChecklist.timeliness.hasExpired
                        ? "text-destructive font-semibold"
                        : readinessChecklist.timeliness.hasPartiallyElapsed
                        ? "text-amber-600 dark:text-amber-400 font-semibold"
                        : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {readinessChecklist.timeliness.hasExpired
                      ? "Expired Windows"
                      : readinessChecklist.timeliness.hasPartiallyElapsed
                      ? "Partially Elapsed"
                      : "Up-to-Date"}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsLaunchDialogOpen(false)}
                disabled={isLaunching}
              >
                Cancel
              </Button>
              <Button
                variant={hasConflicts || readinessChecklist.timeliness.hasExpired ? "secondary" : "default"}
                onClick={handleLaunchCampaign}
                disabled={isLaunching || hasConflicts || !readinessChecklist.isReady}
                className={cn(
                  hasConflicts
                    ? "cursor-not-allowed opacity-60"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                )}
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Launching...
                  </>
                ) : hasConflicts ? (
                  "Launch Blocked by Conflict"
                ) : readinessChecklist.timeliness.hasExpired ? (
                  "Launch Blocked: Schedule Expired"
                ) : (
                  "Confirm & Launch"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Campaign Details Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Campaign Details</DialogTitle>
              <DialogDescription>
                Modify the campaign name and description for this draft.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs">
                  Campaign Name
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Q4 Engineering Core Assessment"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-description" className="text-xs">
                  Description
                </Label>
                <Textarea
                  id="edit-description"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Provide context on scope, requirements, or guidelines..."
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSaveDetails}
                disabled={isSavingEdit || !editName.trim()}
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
