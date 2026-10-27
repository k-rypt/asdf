"use client"

import { useState, useId, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"
import {
  isAssessmentApproved,
  canApplyAssessmentToCampaign,
} from "@/lib/assessment/schedule-conflicts"
import {
  Layers,
  Loader2,
  Check,
  AlertCircle,
  FileQuestion,
  Clock,
  Target,
} from "lucide-react"

export interface CapabilityAssessment {
  id: number
  name: string
  status: string | null
  duration_minutes: number | null
  passing_score: number | null
  campaign_id: number | null
}

export interface CapabilityItem {
  id: number
  name: string
  description: string | null
  status: string | null
  assessments: CapabilityAssessment[]
}

interface SetCapabilitiesDialogProps {
  campaignId: number
  campaignName: string
  capabilities: CapabilityItem[]
  trigger?: React.ReactNode
}

export function SetCapabilitiesDialog({
  campaignId,
  campaignName,
  capabilities,
  trigger,
}: SetCapabilitiesDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  // Track map of capabilityId -> selected assessmentId | null
  const [selectedMap, setSelectedMap] = useState<Record<number, number | null>>({})

  // Initialize selections from current campaign state (only if assessment is approved)
  useEffect(() => {
    const initialMap: Record<number, number | null> = {}
    capabilities.forEach((cap) => {
      const alreadyLinked = cap.assessments.find(
        (a) => a.campaign_id === campaignId && isAssessmentApproved(a.status)
      )
      if (alreadyLinked) {
        initialMap[cap.id] = alreadyLinked.id
      } else {
        // default to null (not included)
        initialMap[cap.id] = null
      }
    })
    setSelectedMap(initialMap)
  }, [capabilities, campaignId, open])

  const toggleCapability = (cap: CapabilityItem) => {
    setSelectedMap((prev) => {
      const isCurrentlySelected = prev[cap.id] !== null && prev[cap.id] !== undefined
      if (isCurrentlySelected) {
        return { ...prev, [cap.id]: null }
      } else {
        // Pick only approved and available assessment (not linked to another campaign)
        const defaultAssessment = cap.assessments.find(
          (a) => canApplyAssessmentToCampaign(a, campaignId).canApply
        )
        return {
          ...prev,
          [cap.id]: defaultAssessment ? defaultAssessment.id : null,
        }
      }
    })
  }

  const changeAssessmentForCapability = (capabilityId: number, assessmentId: number) => {
    setSelectedMap((prev) => ({
      ...prev,
      [capabilityId]: assessmentId,
    }))
  }

  const handleSave = async () => {
    setIsSubmitting(true)
    try {
      const selectedAssessmentIds = Object.values(selectedMap).filter(
        (id): id is number => id !== null && id !== undefined
      )

      const res = await fetch(`/api/admin/campaigns/${campaignId}/capabilities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentIds: selectedAssessmentIds }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update capabilities.")
      }

      toast.add({
        title: "Success",
        description: "Campaign capabilities updated successfully!",
        type: "success",
      })

      setOpen(false)
      setIsSubmitting(false)
      router.refresh()
      router.push(`/protected/admin/assessments/${campaignId}/schedule`)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred."
      console.error("Failed to set capabilities:", err)
      toast.add({
        title: "Error",
        description: message,
        type: "error",
      })
      setIsSubmitting(false)
    }
  }

  const selectedCount = Object.values(selectedMap).filter(
    (id) => id !== null && id !== undefined
  ).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button variant="outline" className="gap-1.5 shrink-0">
              <Layers className="h-4 w-4" />
              Set Capabilities
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Campaign: {campaignName}
            </Badge>
          </div>
          <DialogTitle className="text-xl">Set Capabilities</DialogTitle>
          <DialogDescription>
            Select approved capabilities and assessment modules to include in this campaign.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-3">
          {capabilities.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg bg-muted/20 text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
              <p className="font-medium">No capabilities found in the system</p>
              <p className="text-xs mt-1">
                Create capabilities first under the Capabilities section.
              </p>
            </div>
          ) : (
            capabilities.map((cap) => {
              const isSelected = selectedMap[cap.id] !== null && selectedMap[cap.id] !== undefined
              const selectedAssessmentId = selectedMap[cap.id]
              const approvedAssessments = cap.assessments.filter((a) =>
                isAssessmentApproved(a.status)
              )
              const availableAssessments = cap.assessments.filter(
                (a) => canApplyAssessmentToCampaign(a, campaignId).canApply
              )
              const alreadyAppliedToOther = approvedAssessments.filter(
                (a) =>
                  a.campaign_id !== null &&
                  a.campaign_id !== undefined &&
                  a.campaign_id !== campaignId
              )
              const hasApprovedAssessments = approvedAssessments.length > 0
              const hasAvailableAssessments = availableAssessments.length > 0
              const hasAnyAssessments = cap.assessments.length > 0

              return (
                <div
                  key={cap.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? "border-primary/60 bg-primary/[0.03] shadow-xs"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`cap-${cap.id}`}
                      checked={isSelected}
                      disabled={!hasAvailableAssessments || isSubmitting}
                      onChange={() => toggleCapability(cap)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer disabled:cursor-not-allowed"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`cap-${cap.id}`}
                          className={`font-semibold text-sm cursor-pointer ${
                            !hasAvailableAssessments ? "opacity-60 cursor-not-allowed" : ""
                          }`}
                        >
                          {cap.name}
                        </label>
                        <Badge
                          variant={cap.status === "active" ? "default" : "secondary"}
                          className={`text-xs capitalize ${
                            cap.status === "active" ? "bg-emerald-600 text-white" : ""
                          }`}
                        >
                          {cap.status || "Draft"}
                        </Badge>
                      </div>

                      {cap.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {cap.description}
                        </p>
                      )}

                      {!hasAnyAssessments ? (
                        <p className="text-xs text-destructive/80 mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          No assessments created for this capability yet.
                        </p>
                      ) : !hasApprovedAssessments ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          No approved assessments found. Module must be approved before adding to campaign.
                        </p>
                      ) : !hasAvailableAssessments && alreadyAppliedToOther.length > 0 ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          Assessment module is already applied to another campaign. A capability assessment can only be applied once.
                        </p>
                      ) : (
                        <div className="mt-3 pt-2.5 border-t border-border/50">
                          {isSelected ? (
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground block">
                                Selected Assessment:
                              </span>
                              {approvedAssessments.length === 1 ? (
                                <div className="text-xs p-2 rounded-md bg-muted/40 border flex items-center justify-between">
                                  <span className="font-medium truncate pr-2">
                                    {approvedAssessments[0].name}
                                  </span>
                                  <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                                    {approvedAssessments[0].duration_minutes && (
                                      <span className="flex items-center gap-0.5">
                                        <Clock className="h-3 w-3" />
                                        {approvedAssessments[0].duration_minutes}m
                                      </span>
                                    )}
                                    {approvedAssessments[0].passing_score && (
                                      <span className="flex items-center gap-0.5">
                                        <Target className="h-3 w-3" />
                                        {approvedAssessments[0].passing_score}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <select
                                  value={selectedAssessmentId ?? approvedAssessments[0].id}
                                  disabled={isSubmitting}
                                  onChange={(e) =>
                                    changeAssessmentForCapability(
                                      cap.id,
                                      parseInt(e.target.value, 10)
                                    )
                                  }
                                  className="w-full text-xs rounded-md border border-input bg-card px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                                >
                                  {approvedAssessments.map((a) => {
                                    const isOther =
                                      a.campaign_id !== null &&
                                      a.campaign_id !== undefined &&
                                      a.campaign_id !== campaignId
                                    return (
                                      <option key={a.id} value={a.id} disabled={isOther}>
                                        {a.name} ({a.status || "approved"})
                                        {a.duration_minutes ? ` • ${a.duration_minutes}m` : ""}
                                        {isOther ? " [Already in another campaign]" : ""}
                                      </option>
                                    )
                                  })}
                                </select>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {availableAssessments.length}{" "}
                              {availableAssessments.length === 1 ? "assessment" : "assessments"}{" "}
                              available for this campaign
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="border-t pt-3 flex flex-row items-center justify-between sm:justify-between w-full">
          <div className="text-xs text-muted-foreground font-medium">
            {selectedCount} {selectedCount === 1 ? "capability" : "capabilities"} selected
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
              onClick={handleSave}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Capabilities"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
