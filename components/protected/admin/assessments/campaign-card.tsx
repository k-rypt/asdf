"use client"

import { useState, useMemo } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
import { formatDate } from "@/lib/utils"
import { AssessmentCampaign } from "./types"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/toast"
import {
  ClipboardList,
  Calendar,
  EllipsisVertical,
  Layers,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"

interface CampaignCardProps {
  campaign: AssessmentCampaign
  onSelect?: (campaign: AssessmentCampaign) => void
  onArchive?: (campaignId: number) => void
}

export function CampaignCard({ campaign, onSelect, onArchive }: CampaignCardProps) {
  const router = useRouter()
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [confirmName, setConfirmName] = useState("")

  const normalizedStatus = (campaign.status || "draft").toLowerCase()
  const isActive = normalizedStatus === "active" || normalizedStatus === "published"
  const isArchived = normalizedStatus === "archived" || normalizedStatus === "closed"

  /**
   * Discards/Archives the campaign:
   * Requires exact name confirmation before proceeding.
   * Sets status='archived' in Supabase database.
   * Calls onArchive so the item is immediately removed ("deleted") from the catalogue UI.
   */
  const handleArchive = async () => {
    if (confirmName.trim() !== campaign.name.trim()) return

    setIsArchiving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("assessment_campaigns")
        .update({ status: "archived" })
        .eq("id", campaign.id)

      if (error) {
        throw error
      }

      toast.add({
        title: "Campaign Discarded",
        description: `"${campaign.name}" was discarded and archived in the database.`,
        type: "success",
      })

      setIsArchiveDialogOpen(false)
      setConfirmName("")
      onArchive?.(campaign.id)
      router.refresh()
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to discard campaign."
      console.error("Error archiving campaign:", err)
      toast.add({
        title: "Error",
        description: errorMessage,
        type: "error",
      })
    } finally {
      setIsArchiving(false)
    }
  }

  // Derive start and end schedule window from connected assessments
  // Future Guide: When individual assessments have their available_from and available_until
  // set via CampaignEventCalendar, this memoized calculation finds the earliest start and latest end.
  const { startDate, startTime, endDate, endTime } = useMemo(() => {
    const validStarts = (campaign.assessments || [])
      .map((a) => (a.available_from ? new Date(a.available_from).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))

    const validEnds = (campaign.assessments || [])
      .map((a) => (a.available_until ? new Date(a.available_until).getTime() : null))
      .filter((t): t is number => t !== null && !isNaN(t))

    const minStart = validStarts.length > 0 ? new Date(Math.min(...validStarts)) : null
    const maxEnd = validEnds.length > 0 ? new Date(Math.max(...validEnds)) : null

    const formatDatePart = (d: Date | null) =>
      d
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(d)
        : "Not set"

    const formatTimePart = (d: Date | null) =>
      d
        ? new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(d)
        : "--:--"

    return {
      startDate: formatDatePart(minStart),
      startTime: formatTimePart(minStart),
      endDate: formatDatePart(maxEnd),
      endTime: formatTimePart(maxEnd),
    }
  }, [campaign.assessments])

  const handleCardClick = () => {
    router.push(`/protected/admin/assessments/${campaign.id}`)
  }

  return (
    <Card
      className="group relative flex flex-col justify-between h-full transition-all duration-200 cursor-pointer rounded-md border border-card-foreground/40 ring-0 p-0"
      onClick={handleCardClick}
    >
      <div>
        <CardHeader className="flex flex-row items-center justify-between p-4 pb-0 gap-2">
            {/* <div className="flex items-center gap-2">
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
            </div> */}
          <CardTitle className="text-normal tracking-tight text-foreground line-clamp-2">
            {campaign.name}
          </CardTitle>

          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground group-hover:text-foreground"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {onSelect && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(campaign)
                    }}
                  >
                    Quick Preview
                  </DropdownMenuItem>
                )}
                {/* Discard Campaign: sets status='archived' in database and soft-deletes from UI */}
                <DropdownMenuItem
                  variant="destructive"
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsArchiveDialogOpen(true)
                  }}
                >
                  Discard Campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardFooter className="space-y-4 p-0 flex-col">
          {/* {campaign.description ? (
            <CardDescription className="line-clamp-2 text-sm text-muted-foreground min-h-[2.5rem]">
              {campaign.description}
            </CardDescription>
          ) : (
            <p className="text-sm italic text-muted-foreground/60 min-h-[2.5rem]">
              No description provided
            </p>
          )} */}
          <div className="w-full p-4 mb-0 flex flex-col gap-3">
            {/* Connected Assessments Counter */}
            <div className="rounded-lg border bg-muted p-3 flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-base leading-none text-foreground">
                    {campaign.assessmentsCount}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {campaign.assessmentsCount === 1
                      ? "Connected Assessment"
                      : "Connected Assessments"}
                  </div>
                </div>
              </div>

              <Layers className="h-4 w-4 text-muted-foreground/50" />
            </div>
            {/* static date range (implement functionality here) */}
            {/* turn font into "JetBrains Mono" */}
            {/* Future Guide: Font styled with JetBrains Mono / monospace; displays aggregated campaign bounds */}
            <div className="w-full flex justify-between px-2 text-xs">
              <div>
                <p className="text-muted-foreground">Start</p>
                <h1 className="text-xs font-semibold text-foreground tracking-tight font-['JetBrains_Mono',monospace]">{startDate}</h1>
                <p className="text-muted-foreground font-['JetBrains_Mono',monospace]">{startTime}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">End</p>
                <h1 className="text-xs font-semibold text-foreground tracking-tight font-['JetBrains_Mono',monospace]">{endDate}</h1>
                <p className="text-muted-foreground font-['JetBrains_Mono',monospace]">{endTime}</p>
              </div>
            </div>
          </div>
          {/* last updated instead of created at */}
          {/* Future Guide: Uses campaign.updated_at if populated, falling back to created_at */}
          <div className="px-4 py-2 border-t bg-muted flex items-center w-full">
            <span className="text-xs text-muted-foreground">
              Last updated {formatDate(campaign.updated_at || campaign.created_at)}
            </span>
          </div>

        </CardFooter>
      </div>

      {/* <div className="px-6 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground rounded-b-xl">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>Created {formatDate(campaign.created_at)}</span>
        </div>
        <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
          <span>Manage</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div> */}

      {/* Discard / Archive Confirmation Dialog */}
      {/* Future Guide: Confirmation modal requires typing the campaign name before confirming deletion.
          Soft-deletes the campaign from the UI immediately while recording status='archived' in Supabase. */}
      <Dialog
        open={isArchiveDialogOpen}
        onOpenChange={(open) => {
          setIsArchiveDialogOpen(open)
          if (!open) {
            setConfirmName("")
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Discard Campaign</DialogTitle>
            <DialogDescription>
              This action will remove &ldquo;<span className="font-semibold text-foreground">{campaign.name}</span>&rdquo; from your active catalogue. To confirm deletion, type the name of the campaign below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor={`confirm-discard-${campaign.id}`} className="text-xs text-muted-foreground">
              Type <span className="font-semibold text-foreground select-all">{campaign.name}</span> to confirm:
            </Label>
            <Input
              id={`confirm-discard-${campaign.id}`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmName.trim() === campaign.name.trim() && !isArchiving) {
                  e.preventDefault()
                  handleArchive()
                }
              }}
              placeholder={campaign.name}
              autoComplete="off"
              className="h-9"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setIsArchiveDialogOpen(false)
                setConfirmName("")
              }}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation()
                handleArchive()
              }}
              disabled={isArchiving || confirmName.trim() !== campaign.name.trim()}
            >
              {isArchiving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Discarding...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
