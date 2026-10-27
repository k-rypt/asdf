"use client"

import { useState, useMemo, useEffect } from "react"
import { AssessmentCampaign } from "./types"
import { CampaignCard } from "./campaign-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Search,
  Filter,
  ArrowUpDown,
  Layers,
  Activity,
  ClipboardList,
  Calendar,
  X,
  FileQuestion,
  BookCheck,
} from "lucide-react"
import { formatDate, cn } from "@/lib/utils"

interface CampaignCatalogueProps {
  campaigns: AssessmentCampaign[]
}

export function CampaignCatalogue({ campaigns }: CampaignCatalogueProps) {
  // Local campaign state allows optimistic removal when an item is archived ("deleted" in the UI)
  const [campaignList, setCampaignList] = useState(campaigns)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortOption, setSortOption] = useState("newest")
  const [selectedCampaign, setSelectedCampaign] = useState<AssessmentCampaign | null>(null)

  // Keep internal list synchronized whenever parent props change (e.g., after router.refresh())
  useEffect(() => {
    setCampaignList(campaigns)
  }, [campaigns])

  /**
   * Future Guide: handleArchiveCampaign removes the campaign from UI view immediately
   * mimicking a deletion from the user's perspective, while the database records status='archived'.
   */
  const handleArchiveCampaign = (archivedId: number) => {
    setCampaignList((prev) => prev.filter((c) => c.id !== archivedId))
  }

  // Insight calculations
  // Future Guide: Insight metrics calculated from active campaignList.
  // Archived campaigns are treated as soft-deleted in the UI and excluded from active / in-draft counts.
  const totalCampaigns = campaignList.length
  const activeCampaigns = campaignList.filter((c) => {
    const s = (c.status || "draft").toLowerCase()
    return s === "active" || s === "published"
  }).length
  const draftCampaigns = campaignList.filter((c) => {
    const s = (c.status || "draft").toLowerCase()
    return s === "draft"
  }).length
  const finishedCampaigns = campaignList.filter((c) => {
    const s = (c.status || "").toLowerCase()
    return s === "finished" || s === "closed" || s === "completed"
  }).length
  const totalAssessments = campaignList.reduce(
    (acc, c) => acc + (c.assessmentsCount || 0),
    0
  )

  // Filter and Sort
  // Future Guide: When statusFilter === "all", archived campaigns are excluded by default
  // so that archived campaigns appear "deleted" in the UI while existing in the DB.
  // Admins can view archived records by selecting the "Archived" status filter.
  const filteredAndSorted = useMemo(() => {
    let result = [...campaignList]

    // 1. Status Filter
    if (statusFilter === "all") {
      // In the default UI view, archived records are treated as deleted and hidden
      result = result.filter((c) => (c.status || "draft").toLowerCase() !== "archived")
    } else {
      result = result.filter((c) => {
        const s = (c.status || "draft").toLowerCase()
        if (statusFilter === "active") return s === "active" || s === "published"
        if (statusFilter === "draft") return s === "draft"
        if (statusFilter === "archived") return s === "archived" || s === "closed"
        return s === statusFilter
      })
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description && c.description.toLowerCase().includes(q))
      )
    }

    // 3. Sorting
    result.sort((a, b) => {
      switch (sortOption) {
        case "name_asc":
          return a.name.localeCompare(b.name)
        case "name_desc":
          return b.name.localeCompare(a.name)
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "assessments_desc":
          return b.assessmentsCount - a.assessmentsCount
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })

    return result
  }, [campaignList, searchQuery, statusFilter, sortOption])

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all"

  return (
    <div className="space-y-6 mt-4">
      {/* Quick Insights Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Finished Campaigns */}
        <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
              <BookCheck className="h-3 w-3 mr-1" />
              Finished Campaigns
            </div>
            <div className="text-xl font-medium mt-2">{finishedCampaigns}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
              <BookCheck className="h-3 w-3 mr-1" />
              In Draft
            </div>
            <div className="text-xl font-medium mt-2">{draftCampaigns}</div>
          </div>
        </div>
        
        {/* add a chart to display the timeline for campaign scheduling */}
        {/* Future Reference: This 3rd column or dedicated widget can render an interactive
            horizontal timeline/Gantt chart using Recharts or SVG blocks, illustrating each
            campaign's active availability window (earliest available_from to latest available_until). */}

        {/* <div className="flex items-center gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 rounded-lg shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Campaigns
            </div>
            <div className="text-2xl font-bold mt-0.5">{activeCampaigns}</div>
          </div>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card text-card-foreground shadow-xs">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-500 rounded-lg shrink-0">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Connected Assessments
            </div>
            <div className="text-2xl font-bold mt-0.5">{totalAssessments}</div>
          </div>
        </div> */}
      </div>
      
      <div className="border border-2 border-card-foreground/40 rounded-md bg-muted/50 p-5 flex flex-col gap-4">
        {/* Future Guide: Can be made dynamic or replaced with a Tab strip (e.g. All / Drafts / Active / Archived) */}
        <h1>Drafts</h1>

        {/* Search and Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search campaigns by title or description..."
              className="pl-9 pr-8 h-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-sm"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Status Filter Dropdown (Hidden for now as requested; archived selection removed) */}
            {/* <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className={cn(
                      "h-10 gap-2 transition-colors",
                      statusFilter !== "all" &&
                        "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    )}
                  >
                    <Filter
                      className={cn(
                        "h-4 w-4",
                        statusFilter !== "all" ? "text-white" : "text-muted-foreground"
                      )}
                    />
                    {statusFilter !== "all" && (
                      <span className="text-xs font-medium">
                        {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                      </span>
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(val) => val && setStatusFilter(val)}
                >
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioItem value="all">All Campaigns</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="draft">Draft</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu> */}

            {/* Sort Dropdown */}
            {/* Future Guide: Label removed leaving icon. When a sort other than 'most recent' is selected,
                button turns blue and icon turns white to indicate an active sorting state. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      "h-10 w-10 transition-colors",
                      sortOption !== "newest" &&
                        "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    )}
                  >
                    <ArrowUpDown
                      className={cn(
                        "h-4 w-4",
                        sortOption !== "newest" ? "text-white" : "text-muted-foreground"
                      )}
                    />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                {/* Note: In Base UI, DropdownMenuLabel must reside inside DropdownMenuRadioGroup to receive group context */}
                <DropdownMenuRadioGroup
                  value={sortOption}
                  onValueChange={(val) => val && setSortOption(val)}
                >
                  <DropdownMenuLabel>Sort Campaigns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioItem value="newest">Most Recent</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">Oldest First</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name_asc">Name (A-Z)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="name_desc">Name (Z-A)</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="assessments_desc">Most Assessments</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Active Filter Pill */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Showing {filteredAndSorted.length} of {campaignList.length} campaigns
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("")
                setStatusFilter("all")
                setSortOption("newest")
              }}
              className="h-6 px-2 text-xs text-primary"
            >
              Reset filters
            </Button>
          </div>
        )}

        {/* Catalogue Cards Grid */}
        {filteredAndSorted.length === 0 ? (
          <div className="min-h-[240px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-muted/10">
            <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {campaignList.length === 0
                ? "No assessment campaigns found"
                : "No campaigns match your filters"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {campaignList.length === 0
                ? "There are currently no assessment campaigns in the database."
                : "Try adjusting your search query or status filter to see other campaigns."}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("")
                  setStatusFilter("all")
                  setSortOption("newest")
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSorted.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onSelect={(selected) => setSelectedCampaign(selected)}
                onArchive={handleArchiveCampaign}
              />
            ))}
          </div>
        )}

        {/* Connected Assessments Modal */}
        <Dialog
          open={!!selectedCampaign}
          onOpenChange={(open) => {
            if (!open) setSelectedCampaign(null)
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={
                    (selectedCampaign?.status || "").toLowerCase() === "active"
                      ? "default"
                      : "secondary"
                  }
                >
                  {selectedCampaign?.status || "Draft"}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {selectedCampaign ? formatDate(selectedCampaign.created_at) : ""}
                </span>
              </div>
              <DialogTitle className="text-xl">
                {selectedCampaign?.name}
              </DialogTitle>
              {selectedCampaign?.description && (
                <DialogDescription className="pt-1">
                  {selectedCampaign.description}
                </DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Connected Assessments ({selectedCampaign?.assessmentsCount || 0})
                </span>
              </div>

              {selectedCampaign && selectedCampaign.assessments && selectedCampaign.assessments.length > 0 ? (
                <div className="max-h-60 overflow-y-auto divide-y rounded-lg border bg-card">
                  {selectedCampaign.assessments.map((assessment) => (
                    <div
                      key={assessment.id}
                      className="p-3 flex items-center justify-between text-sm hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <FileQuestion className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium">{assessment.name}</span>
                      </div>
                      {assessment.status && (
                        <Badge variant="outline" className="text-xs shrink-0 capitalize">
                          {assessment.status}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center border border-dashed rounded-lg bg-muted/20 text-muted-foreground text-sm">
                  <p>No assessments have been connected to this campaign yet.</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline">Close</Button>} />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
