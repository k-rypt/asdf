"use client"

import { useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { cn } from "cn"
import {
  FileQuestion,
  Layers,
  MoreVertical,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  UserRound,
  Plus,
  Check,
  Clock,
  XCircle,
  HelpCircle,
  AlertCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import { LadderCard } from "./ladder-card"
import { AddQuestionsDialog } from "./add-questions/add-questions-dialog"
import type { LadderLevel } from "@/lib/assessment/ladder"
import { SetActivePresetDialog } from "@/components/protected/admin/capabilities/set-active-preset-dialog"
import { RemoveActivePresetDialog } from "@/components/protected/admin/capabilities/remove-active-preset-dialog"
import { ManageProfilesDialog } from "@/components/protected/admin/capabilities/manage-profiles-dialog"
import { changedRows } from "@/lib/admin/changed-rows"
import type { AssignmentCandidate } from "@/lib/admin/assignment-candidates"
import { toast } from "@/components/ui/toast"

type Section = "assessment" | "profiles"
type SortOrder = "newest" | "oldest" | "name_asc" | "name_desc"

interface OverdueProfile {
  profileId: string
  givenName: string
  lastName: string
  email: string
  deadline: string | null
}

/** questions rows (select *) -- the fields this component reads. */
export interface CapabilityQuestion {
  id: string
  title: string
  type: string
  status: string | null
  created_at: string
}

/** question_presets rows (select *) plus their current approval status. */
export interface CapabilityPreset {
  id: number
  name: string
  capability_id: number
  created_at: string
  status?: string | null
  questionCount?: number
}

/** profile_capabilities rows with the joined profile. */
export interface AssignedProfile {
  profile_id: string
  assignment_type: string | null
  created_at?: string | null
  profiles: { id: string; given_name: string; last_name: string; email: string } | null
}

interface CapabilityTabsProps {
  capabilityId: string
  questions: CapabilityQuestion[]
  presets: CapabilityPreset[]
  ladder: LadderLevel[]
  assignedProfiles: AssignedProfile[]
  overdueProfiles: OverdueProfile[]
  /**
   * Admin-only (same convention as CapabilityDetailView's `canManage`):
   * gates the "Build Assessment" preset action -- a capability owner can
   * save/edit presets, but turning one into a draft assessment is an
   * admin action, matching Publish being admin-only on the Review page.
   *
   * 2026-10-20: also gates the employee-assignment controls (Assign button,
   * per-row Remove, ManageProfilesDialog). Assignment is a manager function,
   * not an owner function, so an owner must not see them; admins keep them
   * (they are the only writers of 'management' rows). Managers assign from
   * their own surface, not this shared view.
   */
  canManage?: boolean
  /**
   * Who may be offered in the Assign-employees dialog. Supplied by the page
   * because the scope depends on the surface (admin: everyone; manager:
   * their department) -- see lib/admin/assignment-candidates.ts.
   */
  candidates?: AssignmentCandidate[]
  currentPresetId?: number | null
  activePresetQuestionCount?: number
  capabilityUpdatedAt?: string | null
}

function sortItems<T>(
  items: T[],
  sortOrder: SortOrder,
  getName: (item: T) => string,
  getDate: (item: T) => string | null
) {
  const sorted = [...items]
  switch (sortOrder) {
    case "newest":
      return sorted.sort(
        (a, b) => new Date(getDate(b) ?? 0).getTime() - new Date(getDate(a) ?? 0).getTime()
      )
    case "oldest":
      return sorted.sort(
        (a, b) => new Date(getDate(a) ?? 0).getTime() - new Date(getDate(b) ?? 0).getTime()
      )
    case "name_asc":
      return sorted.sort((a, b) => getName(a).localeCompare(getName(b)))
    case "name_desc":
      return sorted.sort((a, b) => getName(b).localeCompare(getName(a)))
  }
}

export function CapabilityTabs({
  capabilityId,
  questions,
  presets,
  ladder,
  assignedProfiles,
  overdueProfiles,
  canManage = false,
  candidates = [],
  currentPresetId,
  activePresetQuestionCount = 0,
  capabilityUpdatedAt,
}: CapabilityTabsProps) {
  const activePreset = presets.find((p) => p.id === currentPresetId) ?? null
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const initialSection: Section = tabParam === "profiles" ? "profiles" : "assessment"
  const [activeSection, setActiveSection] = useState<Section>(initialSection)

  // Questions controls
  const [questionSearch, setQuestionSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [questionSortOrder, setQuestionSortOrder] = useState<SortOrder>("newest")

  // Presets controls
  const [presetSearch, setPresetSearch] = useState("")
  const [presetSortOrder, setPresetSortOrder] = useState<SortOrder>("newest")

  // Profiles controls
  const [profileSearch, setProfileSearch] = useState("")
  const [profileSortOrder, setProfileSortOrder] = useState<SortOrder>("newest")

  const [manageProfilesOpen, setManageProfilesOpen] = useState(false)
  const [buildingPresetId, setBuildingPresetId] = useState<number | null>(null)
  const [presetToDelete, setPresetToDelete] = useState<CapabilityPreset | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [isTransitionPending, startTransition] = useTransition()
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const basePath = pathname.startsWith("/protected/admin/capabilities")
    ? "/protected/admin/capabilities"
    : "/protected/capability"

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Unknown date"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  function statusBadge(status: string | null | undefined) {
    switch (status) {
      case "pending_approval":
      case "pending":
        return (
          <Badge
            className="rounded-none bg-amber-500/15 text-amber-300 border border-amber-500/30 gap-1 text-[10px] font-medium py-0 h-4 shadow-none"
          >
            <Clock className="h-2.5 w-2.5 text-amber-400" />
            Pending Approval
          </Badge>
        )
      case "approved":
        return (
          <Badge
            className="rounded-none bg-blue-500/20 text-blue-300 border border-blue-500/30 gap-1 text-[10px] font-medium py-0 h-4 shadow-none"
          >
            <Check className="h-2.5 w-2.5 text-blue-400" />
            Approved
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="rounded-none gap-1 text-[10px] font-medium py-0 h-4 shadow-none">
            <XCircle className="h-2.5 w-2.5" />
            Rejected
          </Badge>
        )
      case null:
      case undefined:
      case "draft":
        return (
          <Badge variant="outline" className="rounded-none bg-muted text-muted-foreground border-border gap-1 text-[10px] font-medium py-0 h-4 shadow-none">
            <AlertCircle className="h-2.5 w-2.5" />
            Not submitted for approval
          </Badge>
        )
      default:
        return null
    }
  }

  const questionTypes = useMemo(
    () => Array.from(new Set(questions.map((q) => q.type).filter(Boolean))) as string[],
    [questions]
  )

  const filteredQuestions = useMemo(() => {
    let list = questions.filter((q) =>
      (q.title ?? "").toLowerCase().includes(questionSearch.toLowerCase())
    )
    if (typeFilter.size > 0) list = list.filter((q) => typeFilter.has(q.type))
    return sortItems(list, questionSortOrder, (q) => q.title ?? "", (q) => q.created_at)
  }, [questions, questionSearch, typeFilter, questionSortOrder])

  const filteredPresets = useMemo(() => {
    const list = presets.filter((p) =>
      (p.name ?? "").toLowerCase().includes(presetSearch.toLowerCase())
    )
    return sortItems(list, presetSortOrder, (p) => p.name ?? "", (p) => p.created_at)
  }, [presets, presetSearch, presetSortOrder])

  const filteredProfiles = useMemo(() => {
    const q = profileSearch.toLowerCase()
    const list = assignedProfiles.filter(
      (ap) =>
        ap.profiles?.given_name?.toLowerCase().includes(q) ||
        ap.profiles?.last_name?.toLowerCase().includes(q) ||
        ap.profiles?.email?.toLowerCase().includes(q)
    )
    return sortItems(
      list,
      profileSortOrder,
      (ap) => `${ap.profiles?.given_name ?? ""} ${ap.profiles?.last_name ?? ""}`,
      (ap) => ap.created_at ?? null
    )
  }, [assignedProfiles, profileSearch, profileSortOrder])

  function toggleType(type: string) {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  async function deleteQuestion(questionId: string) {
    if (!confirm("Delete this question? This cannot be undone.")) return
    const res = await fetch(`/api/admin/questions/${questionId}`, { method: "DELETE" })
    if (res.ok) router.refresh()
  }

  function setActivePreset(preset: CapabilityPreset) {
    if (preset.questionCount === 0) {
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

  function deletePreset(preset: CapabilityPreset) {
    startTransition(async () => {
      try {
        // The route refuses the active preset (lib/admin/preset-edit-rules.ts).
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}`, { method: "DELETE" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? "Failed to delete the preset.")
        setPresetToDelete(null)
      } catch (err) {
        toast.add({
          title: "Couldn't delete preset",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
      router.refresh()
    })
  }

  function submitPreset(preset: CapabilityPreset) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/capabilities/${capabilityId}/presets/${preset.id}/submit`, { method: "POST" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? "Failed to submit the preset.")
        toast.add({
          title: "Submitted for approval",
          description: `"${preset.name}" is pending review by an administrator.`,
          type: "success",
        })
      } catch (err) {
        toast.add({
          title: "Couldn't submit preset",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
      router.refresh()
    })
  }

  async function buildAssessment(preset: CapabilityPreset) {
    if (buildingPresetId != null) return
    setBuildingPresetId(preset.id)
    setBuildError(null)
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
      router.push(
        `${basePath}/${capabilityId}/assessments/${data.assessmentId}/review?ids=${data.questionIds.join(",")}`
      )
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Failed to build assessment.")
      setBuildingPresetId(null)
    }
  }

  function removeProfile(profileId: string) {
    if (!confirm("Remove this profile from the capability?")) return
    startTransition(async () => {
      try {
        changedRows(
          await supabase
            .from("profile_capabilities")
            .delete()
            .eq("capability_id", Number(capabilityId))
            .eq("profile_id", profileId)
            .select("profile_id")
        )
      } catch (err) {
        toast.add({
          title: "Couldn't remove profile",
          description: err instanceof Error ? err.message : String(err),
          type: "error",
        })
      }
      router.refresh()
    })
  }

  return (
    <Tabs
      value={activeSection}
      onValueChange={(val) => setActiveSection(val as Section)}
      className="space-y-6"
    >
      {/* Top Section Navigation */}
      <TabsList>
        <TabsTrigger value="assessment">
          Questions & Presets
        </TabsTrigger>
        <TabsTrigger value="profiles">
          Assigned Profiles
          {assignedProfiles.length > 0 && (
            <Badge variant="secondary" className="rounded-none text-[10px] px-1.5 py-0 h-4">
              {assignedProfiles.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Questions & Presets View (Two Sides) */}
      <TabsContent value="assessment">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Side: Questions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">Questions</h2>
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {questions.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <AddQuestionsDialog capabilityId={capabilityId} ladder={ladder} />
              </div>
            </div>

            {/* Questions toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search questions..."
                  className="pl-8 h-9 text-xs"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "rounded-none",
                        typeFilter.size > 0 &&
                          "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                      )}
                      title={typeFilter.size > 0 ? `Filter by question type (${typeFilter.size} selected)` : "Filter by question type"}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {questionTypes.length === 0 ? (
                    <DropdownMenuItem disabled>No types available</DropdownMenuItem>
                  ) : (
                    questionTypes.map((type) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={typeFilter.has(type)}
                        onCheckedChange={() => toggleType(type)}
                        className="capitalize text-xs"
                      >
                        {type.replace(/_/g, " ")}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "rounded-none",
                        questionSortOrder !== "newest" &&
                          "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                      )}
                      title={`Sort questions (${questionSortOrder.replace("_", " ")})`}
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={questionSortOrder}
                    onValueChange={(v) => setQuestionSortOrder(v as SortOrder)}
                  >
                    <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="newest" className="text-xs">
                      Newest first
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="oldest" className="text-xs">
                      Oldest first
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_asc" className="text-xs">
                      Name (A-Z)
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_desc" className="text-xs">
                      Name (Z-A)
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Questions List */}
            <div className="rounded-md border divide-y max-h-[700px] overflow-y-auto">
              {filteredQuestions.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {questions.length === 0
                    ? "No questions found."
                    : "No questions match your search/filters."}
                </div>
              ) : (
                filteredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`${pathname}/${q.id}`)}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                      <FileQuestion className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-none truncate" title={q.title}>
                          {q.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground capitalize">{q.status}</span>
                          {q.type && (
                            <>
                              <span className="text-muted-foreground text-xs">•</span>
                              <span className="text-xs text-muted-foreground capitalize">
                                {q.type.replace(/_/g, " ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(q.created_at)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Question actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`${pathname}/${q.id}`)}>
                            Edit
                          </DropdownMenuItem>
                          {q.status === "pending_review" && (
                            <DropdownMenuItem variant="destructive" onClick={() => deleteQuestion(q.id)}>
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              )}
            </div>

            <LadderCard key={ladder.map((l) => l.sfiaLevel).join(",")} capabilityId={capabilityId} />
          </div>

          {/* Right Side: Presets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">Presets</h2>
                <Badge variant="secondary" className="text-xs px-2 py-0.5">
                  {presets.length}
                </Badge>
              </div>
              <Button
                size="sm"
                className="h-9"
                onClick={() => router.push(`${pathname}/questions/pool`)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Preset
              </Button>
            </div>

            {/* Preset In Use Card */}
            {activePreset ? (() => {
              const isApproved = activePreset.status === "approved"
              const isPending = activePreset.status === "pending_approval"
              const isRejected = activePreset.status === "rejected"

              const activeBadge = isApproved ? (
                <Badge className="rounded-none bg-blue-500/15 text-blue-200 border border-blue-500/30 gap-1 text-[11px] font-semibold py-0 h-5 shrink-0 shadow-none">
                  <Check className="h-3 w-3 text-blue-300" />
                  Approved
                </Badge>
              ) : isPending ? (
                <Badge className="rounded-none bg-amber-500/15 text-amber-200 border border-amber-500/30 gap-1 text-[11px] font-semibold py-0 h-5 shrink-0 shadow-none">
                  <Clock className="h-3 w-3 text-amber-300" />
                  Pending Approval
                </Badge>
              ) : isRejected ? (
                <Badge variant="destructive" className="rounded-none gap-1 text-[11px] font-medium py-0 h-5 shrink-0">
                  <XCircle className="h-3 w-3" />
                  Rejected
                </Badge>
              ) : null

              return (
                <Card className="rounded-none border border-border bg-card text-card-foreground ring-0 shadow-none p-3.5 gap-2.5 [--card-spacing:0] py-3.5">
                  <div className="flex flex-row items-center justify-between">
                    <span className="text-sm font-semibold tracking-tight text-foreground">
                      Active Preset
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isApproved && !isPending && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => submitPreset(activePreset)}
                          disabled={isTransitionPending}
                          className="rounded-none h-7 px-2.5 text-xs font-medium"
                        >
                          Submit
                        </Button>
                      )}
                      <SetActivePresetDialog
                        capabilityId={capabilityId}
                        currentPresetId={currentPresetId ?? null}
                        presets={presets}
                        canManage={canManage}
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-none h-7 px-2.5 text-xs font-medium"
                          >
                            Change
                          </Button>
                        }
                      />
                      <RemoveActivePresetDialog
                        capabilityId={capabilityId}
                        presetName={activePreset.name}
                        trigger={
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-none h-7 px-2.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 border border-destructive shadow-none"
                          >
                            Remove
                          </Button>
                        }
                      />
                    </div>
                  </div>
                  {/* Sub Card with duotone theme & monospace font */}
                  <div
                      className={cn(
                        "rounded-none border p-3.5 space-y-2 transition-colors font-mono",
                        isApproved
                          ? "border-blue-500/30 bg-blue-950/30 text-blue-200"
                          : isPending
                          ? "border-amber-500/30 bg-amber-950/30 text-amber-200"
                          : isRejected
                          ? "border-destructive/30 bg-destructive/10 text-red-200"
                          : "border-border bg-secondary/40 text-secondary-foreground"
                      )}
                    >
                      {/* Top Row: Title on Left, Badge on Right Edge */}
                      <div className="flex items-center justify-between gap-3">
                        <h4
                          className={cn(
                            "text-xs sm:text-sm font-semibold tracking-tight truncate cursor-pointer hover:underline",
                            isApproved
                              ? "text-blue-100 hover:text-white"
                              : isPending
                              ? "text-amber-200 hover:text-amber-100"
                              : isRejected
                              ? "text-red-100 hover:text-white"
                              : "text-foreground"
                          )}
                          title={`View ${activePreset.name}`}
                          onClick={() => router.push(`${pathname}/presets/${activePreset.id}`)}
                        >
                          {activePreset.name}
                        </h4>
                        {activeBadge && (
                          <div className="shrink-0 ml-auto">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="cursor-help inline-flex shrink-0">
                                    {activeBadge}
                                  </span>
                                }
                              />
                              <TooltipContent side="top" className="max-w-xs text-xs font-sans">
                                {isPending
                                  ? "This preset is pending review by an administrator in the Approvals section."
                                  : isRejected
                                  ? "This preset was rejected by an administrator."
                                  : isApproved
                                  ? "This preset has been approved by an administrator and is active."
                                  : null}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>

                      {/* Bottom Row: [Icon] [Count] • Selected [Date] */}
                      <div
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          isApproved
                            ? "text-blue-300/80"
                            : isPending
                            ? "text-amber-300/80"
                            : isRejected
                            ? "text-red-300/80"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="inline-flex items-center gap-1 font-medium">
                          <HelpCircle
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isApproved
                                ? "text-blue-300"
                                : isPending
                                ? "text-amber-300"
                                : isRejected
                                ? "text-red-300"
                                : "text-muted-foreground"
                            )}
                          />
                          {activePresetQuestionCount}
                        </span>
                        <span>•</span>
                        <span>
                          Selected{" "}
                          {capabilityUpdatedAt
                            ? new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "numeric",
                              }).format(new Date(capabilityUpdatedAt))
                            : "Recently"}
                        </span>
                      </div>
                    </div>
                </Card>
              )
            })() : (
              <div className="space-y-3">
                {/* <Alert
                  variant="destructive"
                  className="rounded-none bg-destructive text-destructive-foreground border-destructive"
                >
                  <AlertCircle className="h-4 w-4 text-destructive-foreground" />
                  <AlertTitle>No Active Preset</AlertTitle>
                  <AlertDescription className="text-destructive-foreground/90">
                    This capability has no active preset. No assessment can be conducted until an active preset is selected.
                  </AlertDescription>
                </Alert> */}

                <div className="rounded-none border border-dashed border-destructive/40 bg-destructive/5 p-5 flex flex-col items-center justify-center text-center">
                  <div className="flex items-center justify-center mb-2.5">
                    <Layers className="w-5 h-5 text-destructive" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1 text-destructive">No Active Preset</h3>
                  <p className="text-destructive text-xs mb-3.5 max-w-[280px]">
                    {canManage
                      ? "Select a preset to define questions and parameters for this capability's assessment."
                      : "This capability has no active preset. No assessment can be conducted until an active preset is selected and approved by an admin."}
                  </p>
                  <SetActivePresetDialog
                    capabilityId={capabilityId}
                    currentPresetId={currentPresetId ?? null}
                    presets={presets ?? []}
                    canManage={canManage}
                    trigger={
                      <Button
                        size="sm"
                        variant="default"
                        className="rounded-none h-8 text-xs font-medium border-destructive/40 bg-destructive text-background hover:bg-destructive/10 hover:text-destructive"
                      >
                        Select Active Preset
                      </Button>
                    }
                  />
                </div>
              </div>
            )}

            {/* Presets toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search presets..."
                  className="pl-8 h-9 text-xs"
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "rounded-none",
                        presetSortOrder !== "newest" &&
                          "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                      )}
                      title={`Sort presets (${presetSortOrder.replace("_", " ")})`}
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={presetSortOrder}
                    onValueChange={(v) => setPresetSortOrder(v as SortOrder)}
                  >
                    <DropdownMenuLabel className="text-xs">Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="newest" className="text-xs">
                      Newest first
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="oldest" className="text-xs">
                      Oldest first
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_asc" className="text-xs">
                      Name (A-Z)
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_desc" className="text-xs">
                      Name (Z-A)
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Presets List */}
            <div className="rounded-md border divide-y max-h-[700px] overflow-y-auto">
              {buildError && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 border-b">
                  {buildError}
                </div>
              )}
              {filteredPresets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {presets.length === 0
                    ? "No presets found."
                    : "No presets match your search."}
                </div>
              ) : (
                filteredPresets.map((p) => {
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`${pathname}/presets/${p.id}`)}
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1 mr-3">
                        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={cn(
                                "text-sm font-medium leading-tight truncate",
                                (p.questionCount === 0 || p.questionCount === undefined)
                                  ? "text-destructive dark:text-red-400"
                                  : "text-foreground"
                              )}
                              title={p.name}
                            >
                              {p.name}
                            </p>
                          </div>

                          {/* Number of questions below the title */}
                          {p.questionCount !== undefined && (
                            <div>
                              <span
                                className={cn(
                                  "text-[10px] font-medium rounded-none px-1.5 py-0 h-4 inline-flex items-center border",
                                  p.questionCount === 0
                                    ? "bg-destructive/10 text-destructive dark:text-red-400 border-destructive/30"
                                    : "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {p.questionCount} {p.questionCount === 1 ? "question" : "questions"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(p.created_at)}
                          </span>
                          {statusBadge(p.status)}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Preset actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`${pathname}/presets/${p.id}`)}>
                              View / Edit
                            </DropdownMenuItem>
                            {p.id !== currentPresetId && (
                              <DropdownMenuItem onClick={() => setActivePreset(p)}>
                                Set as Active
                              </DropdownMenuItem>
                            )}
                            {canManage && (
                              <DropdownMenuItem
                                onClick={() => buildAssessment(p)}
                                disabled={buildingPresetId != null}
                              >
                                {buildingPresetId === p.id ? "Building..." : "Build Assessment"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setPresetToDelete(p)}
                              disabled={p.id === currentPresetId}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Assigned Profiles Section */}
      <TabsContent value="profiles">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search profiles..."
                  className="pl-8 w-[240px] h-9"
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className={cn(
                        "rounded-none",
                        profileSortOrder !== "newest" &&
                          "bg-foreground text-background border-foreground hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:text-background dark:border-foreground dark:hover:bg-foreground/90"
                      )}
                      title={`Sort profiles (${profileSortOrder.replace("_", " ")})`}
                    >
                      <ArrowUpDown className="h-4 w-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={profileSortOrder}
                    onValueChange={(v) => setProfileSortOrder(v as SortOrder)}
                  >
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_asc">Name (A-Z)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name_desc">Name (Z-A)</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {canManage && (
              <Button size="sm" className="h-9" onClick={() => setManageProfilesOpen(true)}>
                <UserRound className="h-4 w-4 mr-2" />
                Assign
              </Button>
            )}
          </div>

          <div className="rounded-md border">
            {overdueProfiles.length > 0 && (
              <div className="border-b bg-destructive/5 divide-y">
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Overdue ({overdueProfiles.length})
                </div>
                {overdueProfiles.map((op) => (
                  <div key={op.profileId} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-medium leading-none">
                        {op.givenName} {op.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">{op.email}</p>
                    </div>
                    <span className="text-sm text-destructive">
                      {op.deadline ? `Deadline passed ${formatDate(op.deadline)}` : "Deadline passed"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="divide-y">
              {filteredProfiles.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {assignedProfiles.length === 0
                    ? "No assigned profiles found."
                    : "No profiles match your search."}
                </div>
              ) : (
                filteredProfiles.map((ap) => (
                  <div
                    key={ap.profile_id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <UserRound className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-none">
                          {ap.profiles?.given_name} {ap.profiles?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">{ap.profiles?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-muted-foreground">
                        {ap.assignment_type || "Assigned"}
                      </span>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" title="Profile actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => removeProfile(ap.profile_id)}
                            >
                              Remove from capability
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </TabsContent>

      {canManage && (
        <ManageProfilesDialog
          capabilityId={capabilityId}
          assignedProfiles={assignedProfiles}
          candidates={candidates}
          open={manageProfilesOpen}
          onOpenChange={setManageProfilesOpen}
        />
      )}
      <Dialog open={presetToDelete != null} onOpenChange={(open) => !open && !isTransitionPending && setPresetToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete preset?</DialogTitle>
            <DialogDescription>
              &ldquo;{presetToDelete?.name}&rdquo; and its approval history will be permanently deleted. Assessments
              already built from it keep their questions. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPresetToDelete(null)} disabled={isTransitionPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => presetToDelete && deletePreset(presetToDelete)}
              disabled={isTransitionPending}
            >
              {isTransitionPending ? "Deleting..." : "Delete Preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
