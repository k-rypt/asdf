"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CapabilityItem } from "./set-capabilities-dialog"
import {
  isAssessmentApproved,
  canApplyAssessmentToCampaign,
} from "@/lib/assessment/schedule-conflicts"
import {
  AssignCapabilityDialog,
  DepartmentSummary,
} from "./assign-capability-dialog"
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Layers,
  Trash2,
  Loader2,
  CalendarDays,
  Search,
  Users,
  Lock,
} from "lucide-react"

export interface ScheduledAssessment {
  id: number
  name: string
  capability_id: number | null
  capability_name?: string
  status: string | null
  duration_minutes: number | null
  passing_score: number | null
  available_from: string | null
  available_until: string | null
}

interface CampaignEventCalendarProps {
  campaignId: number
  campaignName: string
  assessments: ScheduledAssessment[]
  allCapabilities: CapabilityItem[]
  departments?: DepartmentSummary[]
  initialAssignmentCounts?: Record<number, number>
}

const CAPABILITY_COLORS = [
  {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  {
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  {
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    text: "text-purple-800 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-800",
    dot: "bg-purple-500",
  },
  {
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  {
    bg: "bg-rose-500/10 dark:bg-rose-500/20",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
]

function getColorForCapability(id: number | null | undefined) {
  const index = Math.abs((id ?? 0) % CAPABILITY_COLORS.length)
  return CAPABILITY_COLORS[index]
}

function formatTimeString(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDateString(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatFullDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "Untimed"
  if (minutes <= 60) {
    return `${String(Math.round(minutes)).padStart(2, "0")}:00`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = Math.round(minutes % 60)
  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:00`
}

function formatHeaderDate(dateString: string): string {
  if (!dateString) return ""
  const [y, m, d] = dateString.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function CampaignEventCalendar({
  campaignId,
  campaignName,
  assessments,
  allCapabilities,
  departments = [],
  initialAssignmentCounts = {},
}: CampaignEventCalendarProps) {
  const router = useRouter()

  // Calendar date view
  const [currentDate, setCurrentDate] = useState(() => {
    const firstScheduled = assessments.find((a) => a.available_from)
    return firstScheduled ? new Date(firstScheduled.available_from!) : new Date()
  })

  const [viewMode, setViewMode] = useState<"month" | "list">("month")

  // Capabilities tab: "added" vs "not_added"
  const [capabilityTab, setCapabilityTab] = useState<"added" | "not_added">("added")

  // Search query for the available capabilities pool
  const [searchQuery, setSearchQuery] = useState("")

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState("")
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("10:00")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Day schedule modal state (displays schedule list of assessments assigned to clicked date)
  const [dayScheduleModalOpen, setDayScheduleModalOpen] = useState(false)
  const [selectedDayDate, setSelectedDayDate] = useState("")

  // Capability assignment counts state: capabilityId -> count
  const [assignmentCounts, setAssignmentCounts] = useState<Record<number, number>>(
    () => initialAssignmentCounts || {}
  )
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<{
    capabilityId: number
    capabilityName: string
    assessmentName?: string
  } | null>(null)

  useEffect(() => {
    if (initialAssignmentCounts) {
      setAssignmentCounts(initialAssignmentCounts)
    }
  }, [initialAssignmentCounts])

  function openAssignModal(
    capabilityId: number | null | undefined,
    capabilityName: string = "Capability Assessment",
    assessmentName?: string
  ) {
    if (!capabilityId) return
    setAssignTarget({
      capabilityId,
      capabilityName,
      assessmentName,
    })
    setAssignModalOpen(true)
  }

  function getAssignedCount(capabilityId: number | null | undefined): number {
    if (!capabilityId) return 0
    return assignmentCounts[capabilityId] || 0
  }

  function handleAssignmentSuccess(capabilityId: number, newCount: number) {
    setAssignmentCounts((prev) => ({
      ...prev,
      [capabilityId]: newCount,
    }))
    router.refresh()
  }

  // Map capability names
  const capabilityMap = useMemo(() => {
    const map = new Map<number, string>()
    allCapabilities.forEach((c) => map.set(c.id, c.name))
    return map
  }, [allCapabilities])

  // Enriched assessments with capability name
  const enrichedAssessments = useMemo(() => {
    return assessments.map((a) => ({
      ...a,
      capability_name: a.capability_id
        ? capabilityMap.get(a.capability_id) || "Capability"
        : "General",
    }))
  }, [assessments, capabilityMap])

  // Split into Added (scheduled on calendar) vs Not Added (available pool)
  const addedList = useMemo(() => {
    return enrichedAssessments
      .filter((a) => a.available_from && a.available_until)
      .sort(
        (a, b) =>
          new Date(a.available_from!).getTime() - new Date(b.available_from!).getTime()
      )
  }, [enrichedAssessments])

  // Assessments scheduled on the clicked calendar date
  const selectedDayAssessments = useMemo(() => {
    if (!selectedDayDate) return []
    return addedList.filter((a) => {
      const aDateStr = new Date(a.available_from!).toISOString().split("T")[0]
      return aDateStr === selectedDayDate
    })
  }, [selectedDayDate, addedList])

  const handleDayClick = (dateString: string) => {
    setSelectedDayDate(dateString)
    setDayScheduleModalOpen(true)
  }

  const notAddedList = useMemo(() => {
    const scheduledIds = new Set(addedList.map((a) => a.id))

    // Capabilities that already have an assessment attached to this campaign
    const existingCapabilityIds = new Set(
      enrichedAssessments
        .map((a) => a.capability_id)
        .filter((id): id is number => id !== null && id !== undefined)
    )

    // Collect candidates into a Map keyed by assessment id
    const poolMap = new Map<number, ScheduledAssessment>()

    // 1. Any assessments attached to this campaign that aren't yet scheduled
    enrichedAssessments
      .filter((a) => !a.available_from || !a.available_until)
      .forEach((a) => {
        poolMap.set(a.id, a)
      })

    // 2. All capability assessments from the overall system pool that aren't scheduled,
    // aren't already applied to another campaign, and whose capability is not yet in this campaign
    allCapabilities.forEach((cap) => {
      // Each capability can only be applied once per campaign
      if (existingCapabilityIds.has(cap.id)) return

      cap.assessments.forEach((assessment) => {
        // Exclude if already assigned to another campaign
        if (
          assessment.campaign_id !== null &&
          assessment.campaign_id !== undefined &&
          assessment.campaign_id !== campaignId
        ) {
          return
        }

        if (!scheduledIds.has(assessment.id) && !poolMap.has(assessment.id)) {
          poolMap.set(assessment.id, {
            id: assessment.id,
            name: assessment.name,
            capability_id: cap.id,
            capability_name: cap.name,
            status: assessment.status,
            duration_minutes: assessment.duration_minutes,
            passing_score: assessment.passing_score,
            available_from: null,
            available_until: null,
          })
        }
      })
    })

    let list = Array.from(poolMap.values())

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.capability_name && item.capability_name.toLowerCase().includes(q))
      )
    }

    return list
  }, [enrichedAssessments, addedList, allCapabilities, campaignId, searchQuery])

  // Filter candidates for schedule modal: only approved assessments are available
  const approvedCandidates = useMemo(() => {
    const combined = [
      ...enrichedAssessments,
      ...notAddedList.filter(
        (na) => !enrichedAssessments.some((ea) => ea.id === na.id)
      ),
    ]
    return combined.filter((a) => isAssessmentApproved(a.status))
  }, [enrichedAssessments, notAddedList])

  const selectItems = useMemo(() => {
    return approvedCandidates.map((a) => {
      const isAlreadyScheduled = Boolean(a.available_from && a.available_until)
      const isOtherScheduled = isAlreadyScheduled && a.id !== selectedAssessmentId
      return {
        value: String(a.id),
        label: `${a.capability_name}: ${a.name} (${a.duration_minutes || 60}m)${
          isOtherScheduled ? " [Already Scheduled]" : ""
        }`,
      }
    })
  }, [approvedCandidates, selectedAssessmentId])

  // Overlap detection
  const conflicts = useMemo(() => {
    const scheduled = enrichedAssessments.filter((a) => a.available_from && a.available_until)
    const detected: Array<{
      assessmentA: ScheduledAssessment
      assessmentB: ScheduledAssessment
    }> = []

    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i]
        const b = scheduled[j]
        const startA = new Date(a.available_from!).getTime()
        const endA = new Date(a.available_until!).getTime()
        const startB = new Date(b.available_from!).getTime()
        const endB = new Date(b.available_until!).getTime()

        // Overlap condition: startA < endB && endA > startB
        if (startA < endB && endA > startB) {
          detected.push({ assessmentA: a, assessmentB: b })
        }
      }
    }
    return detected
  }, [enrichedAssessments])

  // Conflicted assessment ID set
  const conflictIdSet = useMemo(() => {
    const set = new Set<number>()
    conflicts.forEach((c) => {
      set.add(c.assessmentA.id)
      set.add(c.assessmentB.id)
    })
    return set
  }, [conflicts])

  // Calendar math for month view
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay()
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate()
    const prevMonthDays = new Date(year, month, 0).getDate()

    const days: Array<{
      date: Date
      isCurrentMonth: boolean
      dateString: string
      dayNumber: number
    }> = []

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i)
      days.push({
        date: d,
        isCurrentMonth: false,
        dateString: d.toISOString().split("T")[0],
        dayNumber: prevMonthDays - i,
      })
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i)
      days.push({
        date: d,
        isCurrentMonth: true,
        dateString: d.toISOString().split("T")[0],
        dayNumber: i,
      })
    }

    // Next month padding to fill grid
    const remaining = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i)
      days.push({
        date: d,
        isCurrentMonth: false,
        dateString: d.toISOString().split("T")[0],
        dayNumber: i,
      })
    }

    return days
  }, [year, month])

  const todayString = new Date().toISOString().split("T")[0]

  // Month navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  // Open schedule dialog
  const openScheduleForDate = (
    dateString?: string,
    assessment?: ScheduledAssessment
  ) => {
    const defaultDate = dateString || new Date().toISOString().split("T")[0]
    setSelectedDate(defaultDate)

    if (assessment) {
      if (isAssessmentApproved(assessment.status)) {
        setSelectedAssessmentId(assessment.id)
      } else {
        setSelectedAssessmentId(null)
      }
      if (assessment.available_from && assessment.available_until) {
        const start = new Date(assessment.available_from)
        const end = new Date(assessment.available_until)
        setStartTime(start.toTimeString().slice(0, 5))
        setEndTime(end.toTimeString().slice(0, 5))
      } else {
        setStartTime("09:00")
        const duration = assessment.duration_minutes || 60
        const endHour = 9 + Math.floor(duration / 60)
        const endMin = duration % 60
        setEndTime(
          `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`
        )
      }
    } else {
      const candidate =
        approvedCandidates.find((a) => !a.available_from || !a.available_until) ||
        approvedCandidates[0]
      if (candidate) {
        setSelectedAssessmentId(candidate.id)
        const duration = candidate.duration_minutes || 60
        setStartTime("09:00")
        const endHour = 9 + Math.floor(duration / 60)
        const endMin = duration % 60
        setEndTime(
          `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`
        )
      } else {
        setSelectedAssessmentId(null)
      }
    }

    setScheduleModalOpen(true)
  }

  // Selected assessment helper for validation
  const selectedAssessment = useMemo(() => {
    return (
      approvedCandidates.find((a) => a.id === selectedAssessmentId) ||
      enrichedAssessments.find((a) => a.id === selectedAssessmentId) ||
      notAddedList.find((a) => a.id === selectedAssessmentId) ||
      null
    )
  }, [approvedCandidates, enrichedAssessments, notAddedList, selectedAssessmentId])

  // Conflict detection for current form inputs
  const currentFormConflict = useMemo(() => {
    if (!selectedAssessmentId || !selectedDate || !startTime || !endTime)
      return null
    const formStart = new Date(`${selectedDate}T${startTime}:00`).getTime()
    const formEnd = new Date(`${selectedDate}T${endTime}:00`).getTime()

    if (formEnd <= formStart) {
      return "End time must be after start time."
    }

    for (const a of enrichedAssessments) {
      if (a.id === selectedAssessmentId) continue
      if (!a.available_from || !a.available_until) continue

      const otherStart = new Date(a.available_from).getTime()
      const otherEnd = new Date(a.available_until).getTime()

      if (formStart < otherEnd && formEnd > otherStart) {
        return `Conflict: Overlaps with "${a.name}" (${formatTimeString(
          a.available_from
        )} - ${formatTimeString(
          a.available_until
        )}). Assessments in this campaign cannot overlap.`
      }
    }

    return null
  }, [selectedAssessmentId, selectedDate, startTime, endTime, enrichedAssessments])

  // Save schedule
  const handleSaveSchedule = async () => {
    if (!selectedAssessmentId || !selectedDate || !startTime || !endTime) {
      toast.add({
        title: "Missing Information",
        description: "Please specify date, start time, and end time.",
        type: "error",
      })
      return
    }

    if (selectedAssessment && !isAssessmentApproved(selectedAssessment.status)) {
      toast.add({
        title: "Approval Required",
        description: `"${selectedAssessment.name}" cannot be scheduled because it has not been approved yet.`,
        type: "error",
      })
      return
    }

    if (selectedAssessment?.capability_id) {
      const duplicateCap = addedList.find(
        (a) =>
          a.capability_id === selectedAssessment.capability_id &&
          a.id !== selectedAssessment.id
      )
      if (duplicateCap) {
        toast.add({
          title: "Duplicate Capability",
          description: `"${duplicateCap.name}" is already scheduled for capability "${selectedAssessment.capability_name}". A capability assessment can only be applied once per campaign.`,
          type: "error",
        })
        return
      }
    }

    if (currentFormConflict) {
      toast.add({
        title: "Schedule Conflict",
        description: currentFormConflict,
        type: "error",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const availableFrom = new Date(
        `${selectedDate}T${startTime}:00`
      ).toISOString()
      const availableUntil = new Date(
        `${selectedDate}T${endTime}:00`
      ).toISOString()

      // Also ensure this assessment is linked to the campaign if it came from not-added
      const res = await fetch(`/api/admin/campaigns/${campaignId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: selectedAssessmentId,
          availableFrom,
          availableUntil,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update schedule.")
      }

      toast.add({
        title: "Scheduled Successfully",
        description: "Capability assessment time slot locked in without overlap.",
        type: "success",
      })

      setScheduleModalOpen(false)
      setIsSubmitting(false)
      router.refresh()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred."
      toast.add({
        title: "Error",
        description: msg,
        type: "error",
      })
      setIsSubmitting(false)
    }
  }

  // Remove schedule
  const handleUnschedule = async (assessmentId: number) => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          availableFrom: null,
          availableUntil: null,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to clear schedule.")
      }

      toast.add({
        title: "Schedule Cleared",
        description: "Assessment has been moved to Not Added.",
        type: "success",
      })

      setScheduleModalOpen(false)
      setIsSubmitting(false)
      router.refresh()
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error clearing schedule."
      toast.add({ title: "Error", description: msg, type: "error" })
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Global Conflict / Overlap Banner */}
      {conflicts.length > 0 ? (
        <div className="p-4 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">
              Schedule Conflict Detected ({conflicts.length})
            </h4>
            <p className="text-xs text-destructive/90">
              The following assessments overlap in time. Non-overlapping scheduling requires adjusting their time windows:
            </p>
            <ul className="text-xs list-disc list-inside mt-1 space-y-0.5">
              {conflicts.map((c, i) => (
                <li key={i}>
                  <strong>{c.assessmentA.name}</strong> overlaps with{" "}
                  <strong>{c.assessmentB.name}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : addedList.length > 0 ? (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>All scheduled assessments are conflict-free with zero time collisions.</span>
          </div>
          <Badge
            variant="outline"
            className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          >
            Non-Overlapping Validated
          </Badge>
        </div>
      ) : null}

      {/* Main 2-Column Layout: Left = Calendar, Right = Capabilities Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_390px] gap-6 items-start">
        {/* Left Column: Event Calendar */}
        <div className="space-y-4">
          {/* Calendar Controls & Month Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {monthName}
              </h2>
              <div className="flex items-center border rounded-lg overflow-hidden bg-card shadow-xs">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-none border-r"
                  onClick={prevMonth}
                  aria-label="Previous Month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs rounded-none border-r font-medium"
                  onClick={goToToday}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-none"
                  onClick={nextMonth}
                  aria-label="Next Month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border bg-card p-0.5">
                <Button
                  variant={viewMode === "month" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setViewMode("month")}
                >
                  Month View
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2.5"
                  onClick={() => setViewMode("list")}
                >
                  Schedule List
                </Button>
              </div>
              <Button
                size="sm"
                onClick={() => openScheduleForDate()}
                className="gap-1.5 h-8 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Schedule Event
              </Button>
            </div>
          </div>

          {/* Main View: Month Grid or Schedule List */}
          {viewMode === "month" ? (
            <Card className="overflow-hidden border shadow-xs">
              <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold text-muted-foreground py-2.5">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y border-b">
                {calendarDays.map((day, idx) => {
                  const isToday = day.dateString === todayString
                  const isSelected = day.dateString === selectedDayDate

                  // Find assessments scheduled on this date
                  const dayAssessments = addedList.filter((a) => {
                    const aDateStr = new Date(a.available_from!).toISOString().split("T")[0]
                    return aDateStr === day.dateString
                  })

                  return (
                    <div
                      key={idx}
                      onClick={() => handleDayClick(day.dateString)}
                      className={`min-h-[110px] p-2 flex flex-col justify-between transition-colors cursor-pointer group hover:bg-muted/40 ${
                        isSelected ? "ring-2 ring-primary ring-inset bg-primary/[0.04]" : ""
                      } ${
                        !day.isCurrentMonth
                          ? "bg-muted/15 text-muted-foreground/40"
                          : "bg-card text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full ${
                            isToday
                              ? "bg-primary text-primary-foreground font-bold shadow-xs"
                              : ""
                          }`}
                        >
                          {day.dayNumber}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openScheduleForDate(day.dateString)
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity"
                          aria-label="Add event on this day"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="space-y-1 mt-1 overflow-y-auto max-h-[70px]">
                        {dayAssessments.map((a) => {
                          const color = getColorForCapability(a.capability_id)
                          const hasConflict = conflictIdSet.has(a.id)
                          return (
                            <div
                              key={a.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDayClick(day.dateString)
                              }}
                              className={`text-[11px] px-1.5 py-0.5 rounded border leading-tight truncate font-medium flex items-center gap-1 hover:brightness-95 ${
                                hasConflict
                                  ? "bg-destructive/15 text-destructive border-destructive/50"
                                  : `${color.bg} ${color.text} ${color.border}`
                              }`}
                              title={`${a.name} (${formatTimeString(
                                a.available_from!
                              )} - ${formatTimeString(a.available_until!)})`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  hasConflict ? "bg-destructive" : color.dot
                                }`}
                              />
                              <span className="truncate">{a.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          ) : (
            /* Schedule List View */
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Scheduled Timeline ({addedList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {addedList.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground text-sm">
                    <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p>No assessment sessions scheduled yet.</p>
                    <Button
                      size="sm"
                      className="mt-3 gap-1.5"
                      onClick={() => openScheduleForDate()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Schedule First Event
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addedList.map((a) => {
                      const color = getColorForCapability(a.capability_id)
                      const hasConflict = conflictIdSet.has(a.id)
                      return (
                        <div
                          key={a.id}
                          className={`p-4 rounded-xl border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                            hasConflict
                              ? "border-destructive/60 bg-destructive/[0.03]"
                              : "hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${color.bg} ${color.text} ${color.border}`}
                            >
                              <CalendarIcon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm flex items-center gap-2">
                                <span>{a.name}</span>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] capitalize font-medium"
                                >
                                  {a.capability_name}
                                </Badge>
                                {hasConflict && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px] h-4 px-1.5"
                                  >
                                    Conflict
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1 font-medium text-foreground/80">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  {formatDateString(a.available_from!)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTimeString(a.available_from!)} –{" "}
                                  {formatTimeString(a.available_until!)}
                                </span>
                                <span>({a.duration_minutes || "Untimed"}m)</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-8 text-xs font-medium"
                              onClick={() => openAssignModal(a.capability_id, a.capability_name, a.name)}
                              title="Assign Departments and Employees"
                            >
                              <Users className="h-3.5 w-3.5 text-primary" />
                              Assign
                              {getAssignedCount(a.capability_id) > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-semibold">
                                  {getAssignedCount(a.capability_id)}
                                </Badge>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openScheduleForDate(undefined, a)}
                            >
                              Edit Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 h-8 w-8"
                              onClick={() => handleUnschedule(a.id)}
                              title="Unschedule"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Capabilities Panel (Moved to Right Side) */}
        <aside className="space-y-3.5 lg:sticky lg:top-4">
          {/* Buttons above the header: "Added" then "Not Added" */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-xl border">
            <Button
              type="button"
              variant={capabilityTab === "added" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCapabilityTab("added")}
              className={`h-8 text-xs font-semibold ${
                capabilityTab === "added"
                  ? "shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Added ({addedList.length})
            </Button>
            <Button
              type="button"
              variant={capabilityTab === "not_added" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCapabilityTab("not_added")}
              className={`h-8 text-xs font-semibold ${
                capabilityTab === "not_added"
                  ? "shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Not Added ({notAddedList.length})
            </Button>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                <span>
                  {capabilityTab === "added"
                    ? "Scheduled Capabilities"
                    : "Available Capabilities Pool"}
                </span>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {capabilityTab === "added"
                  ? "Capabilities locked into this campaign"
                  : "Pick and schedule any capability below"}
              </p>
            </div>
          </div>

          {/* Search Bar for Not Added Pool */}
          {capabilityTab === "not_added" && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search capabilities or assessments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8 pr-3 bg-card"
              />
            </div>
          )}

          {/* Vertical Cards for Each Capability */}
          <div className="flex flex-col gap-3 max-h-[calc(100vh-240px)] overflow-y-auto pr-1.5 min-h-0">
            {capabilityTab === "added" ? (
              addedList.length === 0 ? (
                <div className="p-6 text-center border border-dashed rounded-xl bg-muted/10 text-muted-foreground text-xs space-y-2">
                  <CalendarDays className="h-7 w-7 mx-auto text-muted-foreground/60" />
                  <p className="font-medium text-foreground">No capabilities added yet</p>
                  <p>
                    Switch to &quot;Not Added&quot; to pick and schedule capabilities for this campaign.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs h-7"
                    onClick={() => setCapabilityTab("not_added")}
                  >
                    View Not Added
                  </Button>
                </div>
              ) : (
                addedList.map((item) => {
                  const hasConflict = conflictIdSet.has(item.id)

                  return (
                    <Card
                      key={item.id}
                      className={`shrink-0 py-0! [--card-spacing:0] overflow-hidden border transition-all hover:shadow-xs ${
                        hasConflict
                          ? "border-destructive/70 bg-destructive/[0.03]"
                          : "hover:border-primary/40"
                      }`}
                    >
                      <CardContent className="p-3.5 space-y-2.5">
                        {/* Title Row */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            <Badge variant="default" className="text-xs">
                              {item.capability_name}
                            </Badge>

                            {hasConflict && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] h-4 px-1.5"
                              >
                                Overlap
                              </Badge>
                            )}
                          </div>

                          <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                            {item.name}
                          </h4>
                        </div>

                        {/* Datetime for Start and End */}
                        <div className="space-y-1 bg-muted/40 p-2 rounded-lg border text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Start:
                            </span>
                            <span className="font-semibold text-foreground text-[11px]">
                              {formatFullDateTime(item.available_from!)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              End:
                            </span>
                            <span className="font-semibold text-foreground text-[11px]">
                              {formatFullDateTime(item.available_until!)}
                            </span>
                          </div>
                        </div>

                        {/* Duration & Actions Row */}
                        <div className="flex items-center justify-between text-xs pt-0.5">
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{formatDuration(item.duration_minutes)}</span>
                          </span>

                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2 font-medium gap-1"
                              onClick={() =>
                                openAssignModal(
                                  item.capability_id,
                                  item.capability_name,
                                  item.name
                                )
                              }
                              title="Assign Departments and Employees"
                            >
                              <Users className="h-3 w-3" />
                              Assign
                              {getAssignedCount(item.capability_id) > 0 && (
                                <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.2 rounded font-semibold">
                                  {getAssignedCount(item.capability_id)}
                                </span>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2 font-medium"
                              onClick={() => openScheduleForDate(undefined, item)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              onClick={() => handleUnschedule(item.id)}
                              title="Unschedule"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )
            ) : notAddedList.length === 0 ? (
              <div className="p-6 text-center border border-dashed rounded-xl bg-muted/10 text-muted-foreground text-xs space-y-2">
                {searchQuery ? (
                  <>
                    <Search className="h-7 w-7 mx-auto text-muted-foreground/60" />
                    <p className="font-medium text-foreground">No matching capabilities found</p>
                    <p>Try searching with another keyword or name.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-xs h-7"
                      onClick={() => setSearchQuery("")}
                    >
                      Clear Search
                    </Button>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-600" />
                    <p className="font-medium text-foreground">All capabilities scheduled!</p>
                    <p>
                      Every available capability in the pool has been allocated a time slot.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 text-xs h-7"
                      onClick={() => setCapabilityTab("added")}
                    >
                      View Added
                    </Button>
                  </>
                )}
              </div>
            ) : (
              notAddedList.map((item) => {
                const approved = isAssessmentApproved(item.status)
                return (
                  <Card
                    key={item.id}
                    className="shrink-0 py-0! [--card-spacing:0] overflow-hidden border border-dashed hover:border-primary/50 transition-all hover:shadow-xs"
                  >
                    <CardContent className="p-3.5 space-y-2.5">
                      {/* Title & Capability Badge */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <Badge variant="secondary" className="text-xs">
                            {item.capability_name}
                          </Badge>
                          {approved ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium"
                            >
                              Approved
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1 font-medium"
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Pending Approval
                            </Badge>
                          )}
                        </div>

                        <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                          {item.name}
                        </h4>
                      </div>

                      {/* Duration & Schedule Button */}
                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formatDuration(item.duration_minutes)}</span>
                        </span>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 font-medium gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              openAssignModal(
                                item.capability_id,
                                item.capability_name,
                                item.name
                              )
                            }
                            title="Assign Departments and Employees"
                          >
                            <Users className="h-3 w-3" />
                            Assign
                            {getAssignedCount(item.capability_id) > 0 && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.2 rounded font-semibold">
                                {getAssignedCount(item.capability_id)}
                              </span>
                            )}
                          </Button>

                          {approved ? (
                            <Button
                              size="sm"
                              className="h-6 text-[11px] px-2.5 gap-1 font-semibold"
                              onClick={() => openScheduleForDate(undefined, item)}
                            >
                              <Plus className="h-3 w-3" />
                              Set Schedule
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="h-6 text-[11px] px-2.5 gap-1 font-medium opacity-60 cursor-not-allowed bg-muted text-muted-foreground"
                              title="Assessment module must be approved before it can be scheduled."
                            >
                              <Lock className="h-3 w-3" />
                              Approval Required
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </aside>
      </div>

      {/* Schedule / Edit Modal Dialog */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Assessment Time Slot</DialogTitle>
            <DialogDescription>
              Assign a non-overlapping time window for this assessment campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field>
              <Label htmlFor="assessment-select">Assessment / Capability *</Label>
              {enrichedAssessments.length === 0 && notAddedList.length === 0 ? (
                <p className="text-xs text-destructive">
                  Please assign capabilities to this campaign first.
                </p>
              ) : approvedCandidates.length === 0 ? (
                <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    No approved assessments available. Modules must be approved by an administrator before scheduling.
                  </span>
                </div>
              ) : (
                <Select
                  value={selectedAssessmentId ? String(selectedAssessmentId) : null}
                  onValueChange={(val) => {
                    if (!val) {
                      setSelectedAssessmentId(null)
                      return
                    }
                    const id = parseInt(val, 10)
                    setSelectedAssessmentId(id)
                    const chosen = approvedCandidates.find((a) => a.id === id)
                    if (chosen && chosen.duration_minutes) {
                      const [h, m] = startTime.split(":").map(Number)
                      const totalM = h * 60 + m + chosen.duration_minutes
                      const endH = Math.floor(totalM / 60) % 24
                      const endM = totalM % 60
                      setEndTime(
                        `${String(endH).padStart(2, "0")}:${String(
                          endM
                        ).padStart(2, "0")}`
                      )
                    }
                  }}
                  disabled={isSubmitting}
                  items={selectItems}
                >
                  <SelectTrigger id="assessment-select" className="w-full">
                    <SelectValue placeholder="Select an approved assessment..." />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedCandidates.map((a) => {
                      const isAlreadyScheduled = Boolean(a.available_from && a.available_until)
                      const isOtherScheduled = isAlreadyScheduled && a.id !== selectedAssessmentId

                      return (
                        <SelectItem
                          key={a.id}
                          value={String(a.id)}
                          disabled={isOtherScheduled}
                        >
                          {a.capability_name}: {a.name} ({a.duration_minutes || 60}m)
                          {isOtherScheduled ? " [Already Scheduled]" : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field>
              <Label htmlFor="schedule-date">Scheduled Date *</Label>
              <Input
                type="date"
                id="schedule-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={isSubmitting}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label htmlFor="start-time">Start Time *</Label>
                <Input
                  type="time"
                  id="start-time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value)
                    const chosen =
                      enrichedAssessments.find((a) => a.id === selectedAssessmentId) ||
                      notAddedList.find((a) => a.id === selectedAssessmentId)
                    if (chosen && chosen.duration_minutes) {
                      const [h, m] = e.target.value.split(":").map(Number)
                      const totalM = h * 60 + m + chosen.duration_minutes
                      const endH = Math.floor(totalM / 60) % 24
                      const endM = totalM % 60
                      setEndTime(
                        `${String(endH).padStart(2, "0")}:${String(
                          endM
                        ).padStart(2, "0")}`
                      )
                    }
                  }}
                  disabled={isSubmitting}
                />
              </Field>

              <Field>
                <Label htmlFor="end-time">End Time *</Label>
                <Input
                  type="time"
                  id="end-time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={isSubmitting}
                />
              </Field>
            </div>

            {selectedAssessment && !isAssessmentApproved(selectedAssessment.status) && (
              <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  &ldquo;{selectedAssessment.name}&rdquo; cannot be scheduled because it has not been approved yet. Only approved modules can be scheduled.
                </span>
              </div>
            )}

            {/* Live Conflict Warning */}
            {currentFormConflict && (
              <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{currentFormConflict}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full">
            <div>
              {selectedAssessmentId &&
                enrichedAssessments.find((a) => a.id === selectedAssessmentId)
                  ?.available_from && (
                  <Button
                    variant="ghost"
                    type="button"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleUnschedule(selectedAssessmentId)}
                    disabled={isSubmitting}
                  >
                    Unschedule
                  </Button>
                )}
            </div>

            <div className="flex items-center gap-2">
              <DialogClose
                render={
                  <Button variant="outline" type="button" disabled={isSubmitting}>
                    Cancel
                  </Button>
                }
              />
              <Button
                type="button"
                onClick={handleSaveSchedule}
                disabled={isSubmitting || !selectedAssessmentId || !isAssessmentApproved(selectedAssessment?.status) || !!currentFormConflict}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Lock Time Slot"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Schedule List Dialog (Shown when clicking a date in the calendar) */}
      <Dialog open={dayScheduleModalOpen} onOpenChange={setDayScheduleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              <span>{selectedDayDate ? formatHeaderDate(selectedDayDate) : "Day Schedule"}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedDayAssessments.length === 0
                ? "No assessments scheduled on this date."
                : `${selectedDayAssessments.length} assessment${
                    selectedDayAssessments.length === 1 ? "" : "s"
                  } scheduled on this date`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {selectedDayAssessments.length === 0 ? (
              <div className="p-8 text-center border border-dashed rounded-xl bg-muted/10 text-muted-foreground text-xs space-y-2">
                <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="font-medium text-foreground text-sm">No assessments on this date</p>
                <p>You can schedule an assessment for this date from the available capabilities pool.</p>
                <Button
                  size="sm"
                  className="mt-2 text-xs gap-1"
                  onClick={() => {
                    setDayScheduleModalOpen(false)
                    openScheduleForDate(selectedDayDate)
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Schedule on this Date
                </Button>
              </div>
            ) : (
              selectedDayAssessments.map((a) => {
                const hasConflict = conflictIdSet.has(a.id)
                return (
                  <Card
                    key={a.id}
                    className={`shrink-0 py-0! [--card-spacing:0] overflow-hidden border transition-all hover:shadow-xs ${
                      hasConflict
                        ? "border-destructive/70 bg-destructive/[0.03]"
                        : "hover:border-primary/40"
                    }`}
                  >
                    <CardContent className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <Badge variant="default" className="text-xs">
                          {a.capability_name}
                        </Badge>
                        {hasConflict && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] h-4 px-1.5"
                          >
                            Overlap
                          </Badge>
                        )}
                      </div>

                      <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                        {a.name}
                      </h4>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50 text-muted-foreground">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1 font-medium text-foreground text-[11px]">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {formatTimeString(a.available_from!)} – {formatTimeString(a.available_until!)}
                          </span>
                          <span className="text-[11px]">({formatDuration(a.duration_minutes)})</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 font-medium gap-1"
                            onClick={() => {
                              setDayScheduleModalOpen(false)
                              openAssignModal(a.capability_id, a.capability_name, a.name)
                            }}
                            title="Assign Departments and Employees"
                          >
                            <Users className="h-3 w-3" />
                            Assign
                            {getAssignedCount(a.capability_id) > 0 && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.2 rounded font-semibold">
                                {getAssignedCount(a.capability_id)}
                              </span>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2 font-medium"
                            onClick={() => {
                              setDayScheduleModalOpen(false)
                              openScheduleForDate(selectedDayDate, a)
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => handleUnschedule(a.id)}
                            title="Unschedule"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between w-full sm:justify-between pt-2">
            <DialogClose
              render={
                <Button variant="outline" size="sm" type="button">
                  Close
                </Button>
              }
            />

            {selectedDayAssessments.length > 0 && (
              <Button
                size="sm"
                className="gap-1 text-xs"
                onClick={() => {
                  setDayScheduleModalOpen(false)
                  openScheduleForDate(selectedDayDate)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Schedule Another
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Capability Assessment Dialog */}
      <AssignCapabilityDialog
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        campaignId={campaignId}
        capabilityId={assignTarget?.capabilityId ?? null}
        capabilityName={assignTarget?.capabilityName ?? ""}
        assessmentName={assignTarget?.assessmentName}
        departments={departments || []}
        onSuccess={handleAssignmentSuccess}
      />
    </div>
  )
}
