"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye } from "lucide-react"
import { ApproveDialog } from "./approve-dialog"
import { RejectDialog } from "./reject-dialog"
import { ReviewPresetDialog, type ApprovalRow } from "./review-preset-dialog"

export function ApprovalsList({ rows }: { rows: ApprovalRow[] }) {
  const [reviewTarget, setReviewTarget] = useState<ApprovalRow | null>(null)
  const [approveTarget, setApproveTarget] = useState<ApprovalRow | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ApprovalRow | null>(null)
  const router = useRouter()

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Unknown date"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        No presets pending approval.
      </div>
    )
  }

  return (
    <div className="rounded-md border divide-y">
      {rows.map((row) => (
        <div
          key={row.presetId}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4 hover:bg-muted/30 transition-colors"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold leading-none">
                {row.presetName}
              </span>
              {row.isPresetInUse && (
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/30 text-xs font-semibold py-0.5"
                >
                  Preset in Use
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {row.capabilityName} • {row.questionCount}{" "}
              {row.questionCount === 1 ? "question" : "questions"} • Submitted by{" "}
              {row.submittedByName} on {formatDate(row.submittedAt)}
            </p>

            {row.note && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                <span className="font-medium text-foreground/80 not-italic">Note:</span>{" "}
                &ldquo;{row.note}&rdquo;
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/protected/admin/capabilities/${row.capabilityId}/presets/${row.presetId}`)}
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Review Preset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectTarget(row)}
            >
              Reject
            </Button>
            <Button size="sm" onClick={() => setApproveTarget(row)}>
              Approve
            </Button>
          </div>
        </div>
      ))}

      {reviewTarget && (
        <ReviewPresetDialog
          row={reviewTarget}
          open={!!reviewTarget}
          onOpenChange={(v) => !v && setReviewTarget(null)}
          onApprove={() => {
            const target = reviewTarget
            setReviewTarget(null)
            setApproveTarget(target)
          }}
          onReject={() => {
            const target = reviewTarget
            setReviewTarget(null)
            setRejectTarget(target)
          }}
        />
      )}

      {approveTarget && (
        <ApproveDialog
          row={approveTarget}
          open={!!approveTarget}
          onOpenChange={(v) => !v && setApproveTarget(null)}
          onApproved={(assessmentId) => {
            const capabilityId = approveTarget.capabilityId
            setApproveTarget(null)
            router.push(
              `/protected/admin/capabilities/${capabilityId}/assessments/${assessmentId}/review`
            )
          }}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          row={rejectTarget}
          open={!!rejectTarget}
          onOpenChange={(v) => !v && setRejectTarget(null)}
          onRejected={() => {
            setRejectTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
