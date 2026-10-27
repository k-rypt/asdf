"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  Check,
  Clock,
  XCircle,
  AlertCircle,
  FileText,
  FileQuestion,
  Search,
  Plus,
  Trash2,
  X,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  Layers,
  Save,
  Pencil,
  Info,
  ListFilter,
  GraduationCap,
} from "lucide-react"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import { ApproveDialog } from "@/components/protected/admin/approvals/approve-dialog"
import { RejectDialog } from "@/components/protected/admin/approvals/reject-dialog"
import { RemoveActivePresetDialog } from "@/components/protected/admin/capabilities/remove-active-preset-dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export interface PresetQuestion {
  id: string
  title: string
  type: string | null
  status?: string | null
  description?: string | null
  sfia_level?: string | number | null
  bloom_level?: string | null
  created_at?: string | null
}

export interface ApprovalHistoryItem {
  id: number
  action: "submitted" | "approved" | "rejected"
  note: string | null
  created_at: string
  created_by?: string | null
  profiles?: {
    given_name: string | null
    last_name: string | null
    email?: string | null
  } | null
}

interface PresetDetailClientProps {
  preset: {
    id: number
    name: string
    description?: string | null
    duration_minutes?: number | null
    passing_score?: number | null
    question_type_mix?: Record<string, number> | null
    capability_id: number
    created_at?: string | null
    created_by?: string | null
  }
  capabilityName: string
  capabilityId: string
  status: string
  isCurrentActive: boolean
  initialPresetQuestions: PresetQuestion[]
  allCapabilityQuestions: PresetQuestion[]
  approvalHistory: ApprovalHistoryItem[]
  backHref: string
  canManage: boolean
}

function formatPresetDateParts(isoString?: string | null): { date: string; time: string } {
  if (!isoString) return { date: "-- / -- / --", time: "--" }
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return { date: "-- / -- / --", time: "--" }

  const months = [
    "Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
    "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."
  ]
  const month = months[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()

  let hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  if (hours === 0) hours = 12

  return {
    date: `${month} ${day}, ${year}`,
    time: `${hours}:${minutes} ${ampm}`,
  }
}

function formatPresetDateTime(isoString?: string | null): string {
  if (!isoString) return "N/A"
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return "N/A"

  const months = [
    "Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.",
    "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."
  ]
  const month = months[d.getMonth()]
  const day = d.getDate()
  const year = d.getFullYear()

  let hours = d.getHours()
  const minutes = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  if (hours === 0) hours = 12

  return `${month} ${day}, ${year} - ${hours}:${minutes} ${ampm}`
}

export function PresetDetailClient({
  preset,
  capabilityName,
  capabilityId,
  status: initialStatus,
  isCurrentActive,
  initialPresetQuestions,
  allCapabilityQuestions,
  approvalHistory: initialHistory,
  backHref,
  canManage,
}: PresetDetailClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  // Preset editable state
  const [name, setName] = useState(preset.name)
  const [description, setDescription] = useState(preset.description ?? "")
  const [presetQuestions, setPresetQuestions] = useState<PresetQuestion[]>(initialPresetQuestions)
  const [status, setStatus] = useState(initialStatus)

  const initialLastUpdated = useMemo(() => {
    if (initialHistory && initialHistory.length > 0 && initialHistory[0]?.created_at) {
      return initialHistory[0].created_at
    }
    return preset.created_at ?? new Date().toISOString()
  }, [initialHistory, preset.created_at])

  const [lastUpdated, setLastUpdated] = useState<string>(initialLastUpdated)

  // Filters for questions inside preset
  const [presetSearch, setPresetSearch] = useState("")

  // Filters for available questions to add
  const [availableSearch, setAvailableSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [sfiaFilter, setSfiaFilter] = useState<string>("all")

  // Approval dialog targets (for admins)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [buildingAssessment, setBuildingAssessment] = useState(false)

  // Edit details modal
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(preset.name)
  const [editDescription, setEditDescription] = useState(preset.description ?? "")

  const [deleteOpen, setDeleteOpen] = useState(false)

  const isApproved = status === "approved"
  // Approval is only for the active preset; an edit withdraws a pending request, leaving draft or rejected.
  const canSubmit = isCurrentActive && (status === null || status === "draft" || status === "rejected")
  const isDirty =
    presetQuestions.length !== initialPresetQuestions.length ||
    presetQuestions.some((q, idx) => initialPresetQuestions[idx]?.id !== q.id)

  const latestApproved = useMemo(() => {
    return initialHistory.find((a) => a.action === "approved")
  }, [initialHistory])

  const approvedByName = useMemo(() => {
    if (!latestApproved) return "N/A"
    const p = latestApproved.profiles
    if (p) {
      const full = [p.given_name, p.last_name].filter(Boolean).join(" ").trim()
      if (full) return full
      if (p.email) return p.email
    }
    return "Administrator"
  }, [latestApproved])

  const approvedWhenParts = useMemo(() => {
    return formatPresetDateParts(latestApproved?.created_at)
  }, [latestApproved])

  const lastUpdatedParts = useMemo(() => {
    return formatPresetDateParts(lastUpdated)
  }, [lastUpdated])

  const approvedWhen = useMemo(() => {
    if (!latestApproved?.created_at) return "N/A"
    return formatPresetDateTime(latestApproved.created_at)
  }, [latestApproved])

  const inPresetIds = useMemo(
    () => new Set(presetQuestions.map((q) => q.id)),
    [presetQuestions]
  )

  // Filtered list of questions in this preset
  const filteredPresetQuestions = useMemo(() => {
    if (!presetSearch) return presetQuestions
    const lower = presetSearch.toLowerCase()
    return presetQuestions.filter(
      (q) =>
        q.title.toLowerCase().includes(lower) ||
        (q.type && q.type.toLowerCase().includes(lower))
    )
  }, [presetQuestions, presetSearch])

  // Filtered list of available capability questions not yet in this preset
  const availableQuestions = useMemo(() => {
    return allCapabilityQuestions.filter((q) => {
      if (inPresetIds.has(q.id)) return false
      if (typeFilter !== "all" && q.type !== typeFilter) return false
      if (sfiaFilter !== "all" && String(q.sfia_level) !== sfiaFilter) return false
      if (availableSearch) {
        const lower = availableSearch.toLowerCase()
        if (
          !q.title.toLowerCase().includes(lower) &&
          !(q.description && q.description.toLowerCase().includes(lower))
        ) {
          return false
        }
      }
      return true
    })
  }, [allCapabilityQuestions, inPresetIds, typeFilter, sfiaFilter, availableSearch])

  // Question types present across all questions for filtering
  const questionTypes = useMemo(() => {
    const types = new Set<string>()
    allCapabilityQuestions.forEach((q) => {
      if (q.type) types.add(q.type)
    })
    return Array.from(types)
  }, [allCapabilityQuestions])

  // SFIA levels present across all questions for filtering
  const sfiaLevels = useMemo(() => {
    const levels = new Set<string>()
    allCapabilityQuestions.forEach((q) => {
      if (q.sfia_level !== null && q.sfia_level !== undefined && q.sfia_level !== "") {
        levels.add(String(q.sfia_level))
      }
    })
    return Array.from(levels).sort((a, b) => Number(a) - Number(b))
  }, [allCapabilityQuestions])

  function addQuestion(question: PresetQuestion) {
    if (isApproved) return
    setPresetQuestions((prev) => [...prev, question])
  }

  function removeQuestion(questionId: string) {
    if (isApproved) return
    setPresetQuestions((prev) => prev.filter((q) => q.id !== questionId))
  }

  function handleClearQuestions() {
    if (isApproved) return
    if (
      !confirm(
        `Are you sure you want to remove all ${presetQuestions.length} questions from this preset?`
      )
    ) {
      return
    }
    setPresetQuestions([])
    toast.add({
      title: "Questions Cleared",
      description: "All questions removed from preset. Click 'Save Changes' to apply.",
      type: "info",
    })
  }

  function handleOpenEditModal() {
    setEditName(name)
    setEditDescription(description)
    setEditOpen(true)
  }

  async function handleSaveDetails(e?: React.FormEvent) {
    if (e) e.preventDefault()
    if (!editName.trim()) {
      toast.add({
        title: "Name Required",
        description: "Preset name cannot be empty.",
        type: "error",
      })
      return
    }

    startTransition(async () => {
      try {
        const { error } = await supabase
          .from("question_presets")
          .update({
            name: editName.trim(),
            description: editDescription.trim() || null,
          })
          .eq("id", preset.id)

        if (error) throw error

        setName(editName.trim())
        setDescription(editDescription.trim())
        setLastUpdated(new Date().toISOString())
        setEditOpen(false)
        toast.add({
          title: "Preset Details Saved",
          description: "Preset name and description have been updated.",
          type: "success",
        })
        router.refresh()
      } catch (err) {
        console.error("Failed to update preset details:", err)
        toast.add({
          title: "Update Failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  async function handleSaveChanges() {
    startTransition(async () => {
      try {
        // The route locks approved presets and withdraws a pending request (lib/admin/preset-edit-rules.ts).
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionIds: presetQuestions.map((q) => q.id) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? "Failed to save the preset.")

        setLastUpdated(new Date().toISOString())
        if (data.withdrawn) {
          setStatus(data.status ?? "draft")
          toast.add({
            title: "Approval request withdrawn",
            description: "Your changes are saved. Submit the preset for approval again when it's ready.",
            type: "warning",
          })
        } else {
          toast.add({
            title: "Preset Saved",
            description: "Question composition changes have been saved.",
            type: "success",
          })
        }
        router.refresh()
      } catch (err) {
        console.error("Failed to save preset:", err)
        toast.add({
          title: "Failed to Save",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  async function handleSetActive() {
    if (presetQuestions.length === 0) {
      toast.add({
        title: "Preset Has No Questions",
        description: `"${preset.name}" cannot be set as active because it has no included questions. Please add questions first.`,
        type: "warning",
      })
      return
    }

    if (
      !confirm(
        `Setting "${preset.name}" as the active preset will automatically send a request to the administrator for review and approval.\n\nDo you want to proceed?`
      )
    ) {
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/active-preset`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId: preset.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to set active preset.")
        }

        setLastUpdated(new Date().toISOString())
        setStatus("pending_approval")

        toast.add({
          title: "Active Preset Set",
          description: `"${preset.name}" is now the active preset and is pending review and approval by an administrator.`,
          type: "success",
        })
        router.refresh()
      } catch (err) {
        console.error("Failed to set active preset:", err)
        toast.add({
          title: "Action Failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  async function handleBuildAssessment() {
    if (buildingAssessment) return
    setBuildingAssessment(true)
    try {
      const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}/build-assessment`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to build assessment.")
      if (data.missingLadderLevels?.length > 0) {
        toast.add({
          title: "Ladder levels missing",
          description: `Set up SFIA ${data.missingLadderLevels.join(", ")} in the Self-assessment ladder before publishing.`,
          type: "warning",
        })
      }

      const basePath = canManage ? "/protected/admin/capabilities" : "/protected/capability"
      router.push(`${basePath}/${capabilityId}/assessments/${data.assessmentId}/review?ids=${data.questionIds.join(",")}`)
    } catch (err) {
      toast.add({
        title: "Assessment Build Failed",
        description: err instanceof Error ? err.message : "Failed to build assessment.",
        type: "error",
      })
      setBuildingAssessment(false)
    }
  }

  async function handleSubmitForApproval() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}/submit`, {
          method: "POST",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? "Failed to submit the preset.")

        setLastUpdated(new Date().toISOString())
        setStatus("pending_approval")
        toast.add({
          title: "Submitted for Approval",
          description: `"${name}" is pending review by an administrator.`,
          type: "success",
        })
        router.refresh()
      } catch (err) {
        toast.add({
          title: "Submit Failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  async function handleDeletePreset() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}`, {
          method: "DELETE",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? "Failed to delete the preset.")

        setDeleteOpen(false)
        toast.add({
          title: "Preset Deleted",
          description: `Preset "${preset.name}" has been permanently deleted.`,
          type: "success",
        })
        router.push(backHref)
      } catch (err) {
        toast.add({
          title: "Delete Failed",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
    })
  }

  const questionDetailBase = canManage
    ? `/protected/admin/capabilities/${capabilityId}`
    : `/protected/capability/${capabilityId}`

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-5">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {capabilityName}
        </Link>

        {/* Global Save Button if dirty */}
        {isDirty && !isApproved && (
          <Button
            size="sm"
            onClick={handleSaveChanges}
            disabled={isPending}
            className="rounded-none h-8 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-none animate-in fade-in"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      {/* Main Header */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {name}
            </h1>

            {description ? (
              <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
                {description}
              </p>
            ) : !isApproved ? (
              <button
                type="button"
                onClick={handleOpenEditModal}
                className="text-xs italic text-muted-foreground/60 hover:text-muted-foreground transition-colors text-left"
              >
                + Add a description...
              </button>
            ) : null}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Edit Preset Details */}
              {!isApproved && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenEditModal}
                  disabled={isPending}
                  className="rounded-none h-8 text-xs font-medium"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit Details
                </Button>
              )}

              {/* Admin Approval Actions (when pending) */}
              {canManage && status === "pending_approval" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectOpen(true)}
                    className="rounded-none h-8 text-xs font-medium text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    Reject Preset
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setApproveOpen(true)}
                    className="rounded-none h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Approve Preset
                  </Button>
                </>
              )}

              {/* Set as Active */}
              {!isCurrentActive && (
                <Button
                  size="sm"
                  onClick={handleSetActive}
                  disabled={isPending}
                  className="rounded-none h-8 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Set as Active
                </Button>
              )}

              {/* Build Assessment (Admin) */}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBuildAssessment}
                  disabled={buildingAssessment}
                  className="rounded-none h-8 text-xs font-medium"
                >
                  <Layers className="h-3.5 w-3.5 mr-1.5" />
                  {buildingAssessment ? "Building..." : "Build Assessment"}
                </Button>
              )}

              {/* Submit for Approval (active preset whose request was withdrawn or rejected) */}
              {canSubmit && (
                <Button
                  size="sm"
                  onClick={handleSubmitForApproval}
                  disabled={isPending || isDirty || presetQuestions.length === 0}
                  title={isDirty ? "Save your changes first." : undefined}
                  className="rounded-none h-8 text-xs font-medium"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Submit for Approval
                </Button>
              )}

              {/* Delete (solid destructive) */}
              {!isCurrentActive && (
                <Button
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={isPending}
                  className="rounded-none h-8 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive shadow-none"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              )}
            </div>

            {/* Remove from Active placed on a separate row */}
            {isCurrentActive && (
              <RemoveActivePresetDialog
                capabilityId={capabilityId}
                presetName={name}
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none h-8 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Remove from Active
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {status === "pending_approval" && (
          <div className="rounded-none border border-yellow-500 bg-yellow-500 text-yellow-950 p-3 text-xs flex items-center gap-2.5 font-mono font-medium shadow-sm">
            <Clock className="h-4 w-4 shrink-0 text-yellow-950" />
            <span>
              This preset has been requested as active and is awaiting administrator review and approval.
              Changing its questions withdraws the request; you can submit it again afterwards.
            </span>
          </div>
        )}

        {isApproved && (
          <div className="rounded-none border border-primary bg-primary text-primary-foreground p-3 text-xs flex items-center gap-2.5 font-mono shadow-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-foreground" />
            <span>
              This preset has been approved by an administrator. Its question composition is locked to ensure assessment consistency.
            </span>
          </div>
        )}
      </div>

      {/* Top Cards: Active Preset & Status */}
      <div className={cn("grid grid-cols-1 gap-4", isCurrentActive ? "md:grid-cols-2" : "")}>
        {/* Active Preset Card (if preset is active) */}
        {isCurrentActive && (
          <Card className="rounded-none border border-border bg-card text-card-foreground ring-0 shadow-none p-3.5 gap-2.5 [--card-spacing:0] py-3.5">
            <div className="flex flex-row items-center justify-between">
              <span className="text-sm font-semibold tracking-tight text-foreground">
                Active Preset
              </span>
              {isApproved ? (
                <Badge className="rounded-none bg-blue-500/15 text-blue-200 border border-blue-500/30 gap-1 text-[11px] font-semibold py-0 h-5 shrink-0 shadow-none">
                  <Check className="h-3 w-3 text-blue-300" />
                  Approved
                </Badge>
              ) : status === "pending_approval" ? (
                <Badge className="rounded-none bg-yellow-500/15 text-yellow-200 border border-yellow-500/30 gap-1 text-[11px] font-semibold py-0 h-5 shrink-0 shadow-none">
                  <Clock className="h-3 w-3 text-yellow-300" />
                  Pending Approval
                </Badge>
              ) : null}
            </div>

            <div
              className={cn(
                "rounded-none border p-3.5 transition-colors font-mono",
                isApproved
                  ? "border-blue-500/30 bg-blue-950/40 text-blue-200"
                  : status === "pending_approval"
                  ? "border-yellow-500/30 bg-yellow-950/40 text-yellow-200"
                  : status === "rejected"
                  ? "border-destructive/30 bg-destructive/10 text-red-200"
                  : "border-border bg-secondary/40 text-secondary-foreground"
              )}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span
                    className={cn(
                      "block text-[11px]",
                      isApproved
                        ? "text-blue-300/80"
                        : status === "pending_approval"
                        ? "text-yellow-300/80"
                        : "text-muted-foreground"
                    )}
                  >
                    Approved By
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      isApproved
                        ? "text-blue-100"
                        : status === "pending_approval"
                        ? "text-yellow-100"
                        : "text-foreground"
                    )}
                  >
                    {isApproved ? approvedByName : "N/A"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span
                    className={cn(
                      "block text-[11px]",
                      isApproved
                        ? "text-blue-300/80"
                        : status === "pending_approval"
                        ? "text-yellow-300/80"
                        : "text-muted-foreground"
                    )}
                  >
                    When
                  </span>
                  <div>
                    <div
                      className={cn(
                        "font-semibold",
                        isApproved
                          ? "text-blue-100"
                          : status === "pending_approval"
                          ? "text-yellow-100"
                          : "text-foreground"
                      )}
                    >
                      {approvedWhenParts.date}
                    </div>
                    <div
                      className={cn(
                        "text-[11px]",
                        isApproved
                          ? "text-blue-300/80"
                          : status === "pending_approval"
                          ? "text-yellow-300/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {approvedWhenParts.time}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Status Card */}
        <Card className="rounded-none border border-border bg-card text-card-foreground ring-0 shadow-none p-3.5 gap-2.5 [--card-spacing:0] py-3.5">
          <div className="flex flex-row items-center justify-between">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Preset Status
            </span>
          </div>

          <div className="rounded-none border border-border bg-secondary/30 p-3.5 font-mono text-secondary-foreground">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">Capability</span>
                <span className="font-medium text-foreground truncate block" title={capabilityName}>
                  {capabilityName}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">Last Updated</span>
                <div>
                  <div className="font-medium text-foreground">{lastUpdatedParts.date}</div>
                  <div className="text-[11px] text-muted-foreground">{lastUpdatedParts.time}</div>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">Questions</span>
                <span
                  className={cn(
                    "font-medium",
                    presetQuestions.length === 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {presetQuestions.length}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Customize Preset / Questions Section without outer card wrapper */}
      <div className="space-y-4">
        {!isCurrentActive && (
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Customize Preset
            </h2>
          </div>
        )}

        {/* Side-by-Side Questions Section */}
        <div className={cn("grid grid-cols-1 gap-5", !isApproved ? "lg:grid-cols-2 items-start" : "")}>
          {/* Left Column: Add Questions from Capability */}
          {!isApproved && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    Add Questions
                  </h3>
                  <Badge variant="secondary" className="rounded-none text-xs px-2 py-0.5 font-mono">
                    {availableQuestions.length}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Available questions in {capabilityName} ({availableQuestions.length} remaining)
              </p>

              {/* Search and Filters Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search available questions..."
                    className="pl-8 text-xs h-9 bg-background rounded-none font-mono"
                    value={availableSearch}
                    onChange={(e) => setAvailableSearch(e.target.value)}
                  />
                </div>

                {/* Question Type Filter Dropdown */}
                {questionTypes.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            "h-9 w-9 shrink-0 rounded-none border border-border transition-colors",
                            typeFilter !== "all" &&
                              "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                          )}
                          title={typeFilter !== "all" ? `Question Type: ${typeFilter.replace(/_/g, " ")}` : "Filter by Question Type"}
                          aria-label="Filter by Question Type"
                        >
                          <ListFilter className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-48 rounded-none">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs">Question Type</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setTypeFilter("all")} className="text-xs">
                          <span>All Types</span>
                          {typeFilter === "all" && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        {questionTypes.map((t) => (
                          <DropdownMenuItem key={t} onClick={() => setTypeFilter(t)} className="text-xs">
                            <span className="capitalize">{t.replace(/_/g, " ")}</span>
                            {typeFilter === t && <Check className="ml-auto h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* SFIA Level Filter Dropdown */}
                {sfiaLevels.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            "h-9 w-9 shrink-0 rounded-none border border-border transition-colors",
                            sfiaFilter !== "all" &&
                              "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                          )}
                          title={sfiaFilter !== "all" ? `SFIA Level ${sfiaFilter}` : "Filter by SFIA Level"}
                          aria-label="Filter by SFIA Level"
                        >
                          <GraduationCap className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-40 rounded-none">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs">SFIA Level</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSfiaFilter("all")} className="text-xs">
                          <span>All Levels</span>
                          {sfiaFilter === "all" && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        {sfiaLevels.map((lvl) => (
                          <DropdownMenuItem key={lvl} onClick={() => setSfiaFilter(lvl)} className="text-xs">
                            <span>Level {lvl}</span>
                            {sfiaFilter === lvl && <Check className="ml-auto h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {availableQuestions.length === 0 ? (
                <div className="rounded-none border border-dashed border-border p-8 text-center text-xs text-muted-foreground font-mono">
                  {allCapabilityQuestions.length === presetQuestions.length
                    ? "All questions in this capability are already included in this preset."
                    : "No available questions match your filter."}
                </div>
              ) : (
                <div className="rounded-none border border-border bg-card divide-y divide-border max-h-[500px] overflow-y-auto">
                  {availableQuestions.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-start justify-between p-3.5 hover:bg-muted/50 transition-colors gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`${questionDetailBase}/${q.id}`}
                          className="text-sm font-medium hover:underline flex items-center gap-1.5 group"
                        >
                          <span className="truncate">{q.title}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                        </Link>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap font-mono text-[11px] text-muted-foreground">
                          {q.type && (
                            <span className="capitalize">
                              {q.type.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {q.sfia_level !== null && q.sfia_level !== undefined && q.sfia_level !== "" && (
                          <Badge
                            variant="outline"
                            className="rounded-none border-border bg-secondary/40 text-foreground text-[11px] font-mono h-5 px-1.5 py-0"
                          >
                            SFIA {q.sfia_level}
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none h-7 px-2.5 text-xs font-medium shrink-0"
                          onClick={() => addQuestion(q)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Right Column: Included Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  Included Questions
                </h3>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-none text-xs px-2 py-0.5 font-mono",
                    presetQuestions.length === 0 && "bg-destructive/10 text-destructive border border-destructive/20"
                  )}
                >
                  {presetQuestions.length}
                </Badge>
              </div>

              {!isApproved && presetQuestions.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none h-7 px-2.5 text-xs font-medium bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 hover:text-destructive shadow-none"
                  onClick={handleClearQuestions}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter included questions..."
                className="pl-8 text-xs h-9 bg-background rounded-none font-mono"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
              />
            </div>

            {presetQuestions.length === 0 ? (
              <div className="rounded-none border border-dashed border-border p-8 text-center text-xs text-muted-foreground space-y-2 font-mono">
                <FileText className="h-6 w-6 mx-auto text-muted-foreground/60" />
                <p className="font-medium text-foreground">No questions added yet</p>
                <p>
                  {!isApproved
                    ? "Add questions from the available pool on the left."
                    : "There are no questions in this preset."}
                </p>
              </div>
            ) : filteredPresetQuestions.length === 0 ? (
              <div className="rounded-none border border-dashed border-border p-6 text-center text-xs text-muted-foreground font-mono">
                No questions match your filter.
              </div>
            ) : (
              <div className="rounded-none border border-border bg-card divide-y divide-border max-h-[500px] overflow-y-auto">
                {filteredPresetQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex items-start justify-between p-3.5 hover:bg-muted/50 transition-colors gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground font-mono w-5 shrink-0 pt-0.5">
                        {idx + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`${questionDetailBase}/${q.id}`}
                          className="text-sm font-medium hover:underline flex items-center gap-1.5 group"
                        >
                          <span className="truncate">{q.title}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0" />
                        </Link>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap font-mono text-[11px] text-muted-foreground">
                          {q.type && (
                            <span className="capitalize">
                              {q.type.replace(/_/g, " ")}
                            </span>
                          )}
                          {q.type && q.bloom_level && <span>•</span>}
                          {q.bloom_level && (
                            <span className="capitalize">{q.bloom_level}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: SFIA Badge & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {q.sfia_level !== null && q.sfia_level !== undefined && q.sfia_level !== "" && (
                        <Badge
                          variant="outline"
                          className="rounded-none border-border bg-secondary/40 text-foreground text-[11px] font-mono h-5 px-1.5 py-0"
                        >
                          SFIA {q.sfia_level}
                        </Badge>
                      )}
                      {!isApproved && (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-none h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => removeQuestion(q.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <TooltipContent side="left" className="text-xs font-mono">
                            Remove from preset
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Dialog (for Admin) */}
      <ApproveDialog
        row={{
          presetId: preset.id,
          capabilityId: Number(capabilityId),
          presetName: preset.name,
        }}
        open={approveOpen}
        onOpenChange={setApproveOpen}
        onApproved={() => {
          setStatus("approved")
          setApproveOpen(false)
          router.refresh()
        }}
      />

      {/* Reject Dialog (for Admin) */}
      <RejectDialog
        row={{
          presetId: preset.id,
          capabilityId: Number(capabilityId),
          presetName: preset.name,
        }}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onRejected={() => {
          setStatus("rejected")
          setRejectOpen(false)
          router.refresh()
        }}
      />

      {/* Edit Preset Details Dialog Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg rounded-none border border-border bg-card">
          <form onSubmit={handleSaveDetails}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Edit Preset Details</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Update the name and description for this preset.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="preset-edit-name" className="text-xs">Preset Name *</Label>
                <Input
                  id="preset-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Python Advanced Preset"
                  required
                  autoFocus
                  className="rounded-none font-mono text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="preset-edit-description" className="text-xs">Description</Label>
                <Textarea
                  id="preset-edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description of this preset's purpose and target criteria..."
                  rows={3}
                  className="resize-none text-xs rounded-none font-mono"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-none text-xs h-8"
                onClick={() => setEditOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="rounded-none text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isPending || !editName.trim()}
              >
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(open) => !isPending && setDeleteOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete preset?</DialogTitle>
            <DialogDescription>
              &ldquo;{name}&rdquo; and its approval history will be permanently deleted. Assessments already built
              from it keep their questions. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeletePreset} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete Preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
