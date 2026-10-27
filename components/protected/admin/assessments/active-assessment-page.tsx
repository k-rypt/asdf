"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AssessmentCampaign, DepartmentSummaryItem, AttemptItem } from "./types"
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
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/toast"
import { formatDate, cn } from "@/lib/utils"
import {
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  FileQuestion,
  CalendarDays,
  Users,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  XCircle,
  Search,
  CheckCircle,
  Percent,
  Timer,
  Loader2,
  TrendingUp,
} from "lucide-react"

interface ActiveAssessmentPageProps {
  campaign: AssessmentCampaign
  departments?: DepartmentSummaryItem[]
  attempts?: AttemptItem[]
  allCapabilities?: Array<{ id: number; name: string }>
}

export function ActiveAssessmentPage({
  campaign,
  departments = [],
  attempts = [],
  allCapabilities = [],
}: ActiveAssessmentPageProps) {
  const router = useRouter()
  const [isEndDialogOpen, setIsEndDialogOpen] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  const [attemptSearch, setAttemptSearch] = useState("")

  const assessments = campaign.assessments || []

  // Derive schedule window and days remaining
  const { startDate, endDate, isEnded, daysRemaining } = useMemo(() => {
    const starts = assessments
      .map((a) => (a.available_from ? new Date(a.available_from).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))
    const ends = assessments
      .map((a) => (a.available_until ? new Date(a.available_until).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))

    if (starts.length === 0 || ends.length === 0) {
      return { startDate: "Not set", endDate: "Not set", isEnded: false, daysRemaining: null }
    }

    const minStart = new Date(Math.min(...starts))
    const maxEnd = new Date(Math.max(...ends))
    const now = Date.now()

    const diffDays = Math.ceil((maxEnd.getTime() - now) / (1000 * 60 * 60 * 24))
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d)

    return {
      startDate: fmt(minStart),
      endDate: fmt(maxEnd),
      isEnded: now > maxEnd.getTime(),
      daysRemaining: diffDays > 0 ? diffDays : 0,
    }
  }, [assessments])

  // Total eligible employees across assigned departments
  const totalEligibleEmployees = useMemo(() => {
    const count = departments.reduce((acc, d) => acc + (d.memberCount || 0), 0)
    return count > 0 ? count : Math.max(attempts.length, 12) // fallback baseline if empty
  }, [departments, attempts])

  // Live attempt metrics
  const { completedCount, inProgressCount, passCount, passRate, participationRate } = useMemo(() => {
    const completed = attempts.filter((a) => a.status === "completed" || a.completed_at)
    const inProgress = attempts.filter((a) => a.status === "in_progress" && !a.completed_at)
    const passed = completed.filter((a) => a.passed === true || (a.score !== null && (a.score ?? 0) >= 70))

    const pRate =
      completed.length > 0
        ? Math.round((passed.length / completed.length) * 100)
        : 0

    const partRate = Math.min(
      Math.round(((completed.length + inProgress.length) / Math.max(totalEligibleEmployees, 1)) * 100),
      100
    )

    return {
      completedCount: completed.length,
      inProgressCount: inProgress.length,
      passCount: passed.length,
      passRate: pRate,
      participationRate: partRate,
    }
  }, [attempts, totalEligibleEmployees])

  // Filtered attempts list
  const filteredAttempts = useMemo(() => {
    if (!attemptSearch.trim()) return attempts
    const q = attemptSearch.toLowerCase().trim()
    return attempts.filter(
      (a) =>
        a.profile_name?.toLowerCase().includes(q) ||
        a.profile_email?.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
    )
  }, [attempts, attemptSearch])

  // Handler to end / close the campaign
  const handleEndCampaign = async () => {
    setIsEnding(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("assessment_campaigns")
        .update({ status: "finished" })
        .eq("id", campaign.id)

      if (error) throw error

      toast.add({
        title: "Campaign Concluded",
        description: `"${campaign.name}" has been marked as finished.`,
        type: "success",
      })

      setIsEndDialogOpen(false)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to end campaign."
      console.error("Error ending campaign:", err)
      toast.add({ title: "Error", description: msg, type: "error" })
    } finally {
      setIsEnding(false)
    }
  }

  // Handler to revert campaign back to draft status
  const handleRevertToDraft = async () => {
    setIsReverting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("assessment_campaigns")
        .update({ status: "draft" })
        .eq("id", campaign.id)

      if (error) throw error

      toast.add({
        title: "Reverted to Draft",
        description: `"${campaign.name}" is now in Draft mode.`,
        type: "success",
      })

      setIsRevertDialogOpen(false)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revert campaign."
      console.error("Error reverting campaign:", err)
      toast.add({ title: "Error", description: msg, type: "error" })
    } finally {
      setIsReverting(false)
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
            <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
              <Link
                href={`/protected/admin/assessments/${campaign.id}?view=draft`}
                className="px-2.5 py-1 text-muted-foreground hover:text-foreground rounded-md transition-colors flex items-center gap-1"
              >
                <span>Draft View</span>
                <span className="text-[10px] text-muted-foreground">(preview)</span>
              </Link>
              <span className="px-2.5 py-1 font-medium bg-background text-foreground rounded-md shadow-xs">
                Active View
              </span>
            </div>
          </div>
        </div>

        {/* Campaign Header */}
        <header className="rounded-xl border bg-card p-6 shadow-xs flex flex-col gap-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <div className="flex items-center gap-2.5">
                {/* Live pulsing badge */}
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium flex items-center gap-1.5"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live & Active
                </Badge>

                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Launched on {formatDate(campaign.created_at)}
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
                  No description provided for this active campaign.
                </p>
              )}
            </div>

            {/* Live Operational Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsRevertDialogOpen(true)}
                className="gap-1.5 h-9 text-xs"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Revert to Draft
              </Button>

              <Link
                href={`/protected/admin/assessments/${campaign.id}/schedule`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 h-9 text-xs")}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Live Schedule
              </Link>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsEndDialogOpen(true)}
                className="gap-1.5 h-9 text-xs"
              >
                <XCircle className="h-3.5 w-3.5" />
                End Campaign
              </Button>
            </div>
          </div>

          {/* Live Window Ribbon Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs gap-2">
            <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-300">
              <Activity className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>Campaign Active Window:</strong> Eligible employees are actively participating across connected assessments.
              </span>
            </div>
            <div className="font-['JetBrains_Mono',monospace] text-emerald-800 dark:text-emerald-400 font-medium shrink-0">
              {daysRemaining !== null ? `${daysRemaining} days remaining (Ends ${endDate})` : "Active window running"}
            </div>
          </div>
        </header>

        {/* 4 Live Operational Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Participation Rate
              </CardTitle>
              <Percent className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-['JetBrains_Mono',monospace]">
                {participationRate}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {completedCount + inProgressCount} of {totalEligibleEmployees} participants active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                In-Progress Attempts
              </CardTitle>
              <Timer className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgressCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Employees currently taking assessments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Completed Submissions
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Finished attempt evaluations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pass Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-['JetBrains_Mono',monospace]">
                {completedCount > 0 ? `${passRate}%` : "Pending"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {passCount} passed of {completedCount} evaluated
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Live Modules Status Breakdown */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Live Assessment Modules ({assessments.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Active modules being evaluated by candidates in this campaign.
              </p>
            </div>
            <Link
              href={`/protected/admin/assessments/${campaign.id}/schedule`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs h-9")}
            >
              <CalendarDays className="h-4 w-4" />
              Adjust Module Schedule
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments.map((assessment) => {
              const moduleAttempts = attempts.filter((a) => a.assessment_id === assessment.id)
              const modCompleted = moduleAttempts.filter((a) => a.status === "completed" || a.completed_at).length
              const modInProgress = moduleAttempts.filter((a) => a.status === "in_progress" && !a.completed_at).length

              return (
                <Card key={assessment.id} className="hover:shadow-xs transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-semibold leading-snug">
                          {assessment.name}
                        </CardTitle>
                        {assessment.capability_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Capability: {assessment.capability_name}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs shrink-0"
                      >
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {assessment.duration_minutes
                          ? `${assessment.duration_minutes} mins`
                          : "Untimed"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-muted-foreground" />
                        Passing: {assessment.passing_score ?? 70}%
                      </span>
                    </div>

                    {/* Live progress indicators */}
                    <div className="p-3 rounded-lg bg-muted/40 border space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Live Submissions:</span>
                        <span className="font-semibold text-foreground">
                          {modCompleted} completed · {modInProgress} in progress
                        </span>
                      </div>
                      {assessment.available_until && (
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Window Ends:</span>
                          <span className="font-['JetBrains_Mono',monospace]">
                            {formatDate(assessment.available_until)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Department Participation Breakdown */}
        {departments.length > 0 && (
          <section className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Department Participation Breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time completion overview for each assigned department.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {departments.map((dept) => {
                const completionEstimate = Math.min(
                  Math.round(((dept.completedCount || 0) / Math.max(dept.memberCount, 1)) * 100),
                  100
                )
                return (
                  <div
                    key={dept.id}
                    className="p-3.5 rounded-lg border bg-muted/20 flex flex-col gap-2 text-xs"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-foreground truncate">{dept.name}</span>
                      <span className="text-muted-foreground font-['JetBrains_Mono',monospace]">
                        {dept.memberCount} members
                      </span>
                    </div>

                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(completionEstimate, 5)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Status:</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {dept.completedCount || 0} completed
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Live Submissions Activity Table */}
        <section className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Recent Attempt Activity
              </h2>
              <p className="text-xs text-muted-foreground">
                Employee attempt submissions recorded for this campaign.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter attempts..."
                value={attemptSearch}
                onChange={(e) => setAttemptSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          {filteredAttempts.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20 text-muted-foreground text-xs">
              <p>No attempts recorded for this campaign yet.</p>
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card overflow-hidden">
              {filteredAttempts.slice(0, 10).map((attempt) => (
                <div
                  key={attempt.id}
                  className="p-3 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground">
                      {attempt.profile_name || "Employee"}
                    </div>
                    {attempt.profile_email && (
                      <div className="text-[11px] text-muted-foreground">
                        {attempt.profile_email}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        attempt.status === "completed"
                          ? attempt.passed
                            ? "default"
                            : "outline"
                          : "secondary"
                      }
                      className={
                        attempt.passed
                          ? "bg-emerald-600 text-white text-[10px]"
                          : "text-[10px]"
                      }
                    >
                      {attempt.status === "completed"
                        ? attempt.passed
                          ? "Passed"
                          : "Completed"
                        : "In Progress"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-['JetBrains_Mono',monospace]">
                      {formatDate(attempt.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* End Campaign Confirmation Dialog */}
        <Dialog open={isEndDialogOpen} onOpenChange={setIsEndDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                End Assessment Campaign?
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to conclude &ldquo;<span className="font-semibold text-foreground">{campaign.name}</span>&rdquo;? This will finalize all ongoing testing. No new attempts will be allowed, and the campaign status will be marked as finished.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsEndDialogOpen(false)}
                disabled={isEnding}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleEndCampaign}
                disabled={isEnding}
              >
                {isEnding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Concluding...
                  </>
                ) : (
                  "Conclude Campaign"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revert to Draft Confirmation Dialog */}
        <Dialog open={isRevertDialogOpen} onOpenChange={setIsRevertDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PauseCircle className="h-5 w-5 text-amber-600" />
                Revert Campaign to Draft?
              </DialogTitle>
              <DialogDescription>
                This will move &ldquo;<span className="font-semibold text-foreground">{campaign.name}</span>&rdquo; back to Draft status so you can adjust scheduling or connected capabilities.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setIsRevertDialogOpen(false)}
                disabled={isReverting}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleRevertToDraft}
                disabled={isReverting}
              >
                {isReverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reverting...
                  </>
                ) : (
                  "Confirm Revert"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
