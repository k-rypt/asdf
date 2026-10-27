"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Users,
  Building2,
  Search,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  XCircle,
  Loader2,
  Mail,
  Briefcase,
  AlertCircle,
} from "lucide-react"
import { toast } from "@/components/ui/toast"

export interface DepartmentSummary {
  id: number
  name: string
  status: string | null
  memberCount: number
}

export interface DepartmentEmployee {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
  job_title?: string | null
  roleStatus?: string | null
}

interface AssignCapabilityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number
  capabilityId: number | null
  capabilityName: string
  assessmentName?: string
  departments: DepartmentSummary[]
  onSuccess?: (capabilityId: number, assignedCount: number) => void
}

export function AssignCapabilityDialog({
  open,
  onOpenChange,
  campaignId,
  capabilityId,
  capabilityName,
  assessmentName,
  departments,
  onSuccess,
}: AssignCapabilityDialogProps) {
  // Set-based selection state:
  // selectedDeptIds: departments where ALL employees are included by default
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(new Set())
  // excludedProfileIds: employees within selectedDeptIds who were unchecked (exceptions)
  const [excludedProfileIds, setExcludedProfileIds] = useState<Set<string>>(new Set())
  // includedProfileIds: employees within unselected departments who were checked (exceptions)
  const [includedProfileIds, setIncludedProfileIds] = useState<Set<string>>(new Set())

  // Cache for loaded department members (loaded on-demand when expanded)
  const [deptMembersMap, setDeptMembersMap] = useState<Record<number, DepartmentEmployee[]>>({})
  const [loadingDepts, setLoadingDepts] = useState<Set<number>>(new Set())

  // Expanded departments
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set())

  // Loading initial status for this capability
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch initial assignment status on dialog open
  useEffect(() => {
    if (!open || !capabilityId) return

    let isMounted = true
    setIsLoadingStatus(true)
    setSearchQuery("")
    setExpandedDeptIds(new Set())

    async function loadStatus() {
      try {
        const res = await fetch(
          `/api/admin/campaigns/${campaignId}/assign?capabilityId=${capabilityId}`
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load assignment status")

        if (!isMounted) return

        const breakdown = json.departmentBreakdown as Record<
          number,
          { id: number; name: string; totalMembers: number; assignedCount: number }
        >
        const assignedIds = new Set<string>(json.assignedProfileIds || [])

        const newSelectedDepts = new Set<number>()
        const newExcludedProfiles = new Set<string>()
        const newIncludedProfiles = new Set<string>()

        // Analyze each department's state
        for (const dept of departments) {
          const info = breakdown[dept.id]
          if (!info || info.totalMembers === 0) continue

          if (info.assignedCount === info.totalMembers) {
            // All members assigned
            newSelectedDepts.add(dept.id)
          } else if (info.assignedCount > info.totalMembers / 2) {
            // Majority assigned: mark dept as selected and we'll track unassigned as excluded
            newSelectedDepts.add(dept.id)
          }
        }

        // For individual profile overrides:
        // Any assigned profile in a non-selected department is included
        for (const pid of assignedIds) {
          // We can populate includedProfileIds if we fetch members or save target
          newIncludedProfiles.add(pid)
        }

        setSelectedDeptIds(newSelectedDepts)
        setExcludedProfileIds(newExcludedProfiles)
        setIncludedProfileIds(newIncludedProfiles)
      } catch (err: any) {
        toast.add({
          title: "Status Load Error",
          description: err.message || "Failed to check existing assignments",
          type: "error",
        })
      } finally {
        if (isMounted) setIsLoadingStatus(false)
      }
    }

    loadStatus()

    return () => {
      isMounted = false
    }
  }, [open, capabilityId, campaignId, departments])

  // Lazily fetch members when a department is expanded
  const fetchDepartmentMembers = useCallback(
    async (deptId: number) => {
      if (deptMembersMap[deptId] || loadingDepts.has(deptId)) return

      setLoadingDepts((prev) => new Set(prev).add(deptId))
      try {
        const res = await fetch(`/api/admin/departments/${deptId}/members`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load members")

        const members = (json.members || []) as DepartmentEmployee[]
        setDeptMembersMap((prev) => ({ ...prev, [deptId]: members }))
      } catch (err: any) {
        toast.add({
          title: "Failed to load employees",
          description: err.message,
          type: "error",
        })
      } finally {
        setLoadingDepts((prev) => {
          const next = new Set(prev)
          next.delete(deptId)
          return next
        })
      }
    },
    [deptMembersMap, loadingDepts]
  )

  // Toggle department expansion
  function toggleExpand(deptId: number) {
    setExpandedDeptIds((prev) => {
      const next = new Set(prev)
      if (next.has(deptId)) {
        next.delete(deptId)
      } else {
        next.add(deptId)
        // Fetch members on demand if not already loaded
        fetchDepartmentMembers(deptId)
      }
      return next
    })
  }

  // Handle department checkbox toggle:
  // "by default all employees should be included once the department has been selected, but allow the admin to adjust this"
  function handleDepartmentToggle(dept: DepartmentSummary) {
    if (dept.memberCount === 0) return

    const isDeptSelected = selectedDeptIds.has(dept.id)
    const members = deptMembersMap[dept.id] || []

    setSelectedDeptIds((prev) => {
      const next = new Set(prev)
      if (isDeptSelected) {
        next.delete(dept.id)
      } else {
        next.add(dept.id)
      }
      return next
    })

    // Reset exclusions/inclusions for this department's members
    if (members.length > 0) {
      const memberIdSet = new Set(members.map((m) => m.id))
      setExcludedProfileIds((prev) => {
        const next = new Set(prev)
        for (const id of memberIdSet) next.delete(id)
        return next
      })
      setIncludedProfileIds((prev) => {
        const next = new Set(prev)
        for (const id of memberIdSet) next.delete(id)
        return next
      })
    }
  }

  // Handle individual employee toggle
  function handleEmployeeToggle(deptId: number, employeeId: string) {
    const isDeptSelected = selectedDeptIds.has(deptId)

    if (isDeptSelected) {
      // In a selected department, unchecking adds to excludedProfileIds
      setExcludedProfileIds((prev) => {
        const next = new Set(prev)
        if (next.has(employeeId)) {
          next.delete(employeeId)
        } else {
          next.add(employeeId)
        }
        return next
      })
    } else {
      // In an unselected department, checking adds to includedProfileIds
      setIncludedProfileIds((prev) => {
        const next = new Set(prev)
        if (next.has(employeeId)) {
          next.delete(employeeId)
        } else {
          next.add(employeeId)
        }
        return next
      })
    }
  }

  // Check if a specific employee is selected
  function isEmployeeSelected(deptId: number, employeeId: string): boolean {
    if (selectedDeptIds.has(deptId)) {
      return !excludedProfileIds.has(employeeId)
    }
    return includedProfileIds.has(employeeId)
  }

  // Compute selected count for a department
  function getDepartmentSelectedCount(dept: DepartmentSummary): number {
    if (dept.memberCount === 0) return 0
    const members = deptMembersMap[dept.id]

    if (selectedDeptIds.has(dept.id)) {
      if (!members) {
        // Members not loaded yet: subtract known exclusions for this dept
        return Math.max(0, dept.memberCount - excludedProfileIds.size)
      }
      const excludedInDept = members.filter((m) => excludedProfileIds.has(m.id)).length
      return Math.max(0, dept.memberCount - excludedInDept)
    } else {
      if (!members) {
        return 0
      }
      return members.filter((m) => includedProfileIds.has(m.id)).length
    }
  }

  // Select all departments
  function handleSelectAll() {
    setSelectedDeptIds(new Set(departments.map((d) => d.id)))
    setExcludedProfileIds(new Set())
    setIncludedProfileIds(new Set())
  }

  // Deselect all
  function handleDeselectAll() {
    setSelectedDeptIds(new Set())
    setExcludedProfileIds(new Set())
    setIncludedProfileIds(new Set())
  }

  // Save assignments using set-based operations
  async function handleSave() {
    if (!capabilityId) {
      toast.add({
        title: "Error",
        description: "Invalid capability selected",
        type: "error",
      })
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capabilityId,
          selectedDeptIds: Array.from(selectedDeptIds),
          excludedProfileIds: Array.from(excludedProfileIds),
          includedProfileIds: Array.from(includedProfileIds),
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to update assignments")
      }

      const totalAssigned = json.assignedCount ?? totalSelectedEmployees

      toast.add({
        title: "Assignments Saved",
        description: `${totalAssigned} employee${
          totalAssigned === 1 ? "" : "s"
        } can access this assessment.`,
        type: "success",
      })

      if (onSuccess) {
        onSuccess(capabilityId, totalAssigned)
      }
      onOpenChange(false)
    } catch (err: any) {
      toast.add({
        title: "Save Failed",
        description: err.message || "Failed to save assignments",
        type: "error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Filter departments by search
  const filteredDepartments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return departments

    return departments.filter((d) => d.name.toLowerCase().includes(q))
  }, [departments, searchQuery])

  // Total selected employee count across all departments
  const totalSelectedEmployees = useMemo(() => {
    let total = 0
    for (const d of departments) {
      total += getDepartmentSelectedCount(d)
    }
    return total
  }, [departments, selectedDeptIds, excludedProfileIds, includedProfileIds, deptMembersMap])

  // Total active selected departments
  const selectedDepartmentCount = useMemo(() => {
    let count = 0
    for (const d of departments) {
      if (getDepartmentSelectedCount(d) > 0) count++
    }
    return count
  }, [departments, selectedDeptIds, excludedProfileIds, includedProfileIds, deptMembersMap])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-3 border-b bg-card">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">
              {capabilityName}
            </Badge>
            <span className="text-xs text-muted-foreground font-medium">
              Access Control
            </span>
          </div>

          <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2 mt-1">
            <Users className="h-5 w-5 text-primary" />
            <span>Assign Assessment Access</span>
          </DialogTitle>

          <DialogDescription className="text-xs text-muted-foreground">
            Select departments and fine-tune employees who can take the{" "}
            <span className="font-semibold text-foreground">
              {assessmentName || capabilityName}
            </span>{" "}
            assessment.
          </DialogDescription>
        </DialogHeader>

        {/* Search & Bulk Action Bar */}
        <div className="px-5 py-3 border-b bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8.5 h-8.5 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="h-8 text-xs px-2.5 font-medium gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              className="h-8 text-xs px-2.5 font-medium gap-1 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {/* Scrollable Department Hierarchy (Lazy-loaded members) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[260px] max-h-[50vh]">
          {isLoadingStatus ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Loading department assignment status...</span>
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-xl bg-muted/10 text-muted-foreground text-xs space-y-1.5">
              <Building2 className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
              <p className="font-semibold text-foreground">No departments found</p>
              <p>
                {searchQuery
                  ? "No departments matched your search query."
                  : "No departments are configured in the system."}
              </p>
              {searchQuery && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs h-7"
                  onClick={() => setSearchQuery("")}
                >
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            filteredDepartments.map((dept) => {
              const selectedCount = getDepartmentSelectedCount(dept)
              const totalCount = dept.memberCount
              const isAllSelected = totalCount > 0 && selectedCount === totalCount
              const isIndeterminate = selectedCount > 0 && selectedCount < totalCount
              const isExpanded = expandedDeptIds.has(dept.id)
              const members = deptMembersMap[dept.id]
              const isLoadingMembers = loadingDepts.has(dept.id)

              return (
                <div
                  key={dept.id}
                  className={`border rounded-xl transition-all overflow-hidden ${
                    isAllSelected
                      ? "border-primary/40 bg-primary/[0.02]"
                      : isIndeterminate
                      ? "border-primary/30 bg-muted/20"
                      : "border-border/80 bg-card hover:border-border"
                  }`}
                >
                  {/* Department Header Row */}
                  <div className="flex items-center justify-between p-3 gap-2 bg-muted/30 select-none">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Department Checkbox */}
                      <Checkbox
                        id={`dept-cb-${dept.id}`}
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        disabled={totalCount === 0 || isSaving}
                        onCheckedChange={() => handleDepartmentToggle(dept)}
                      />

                      {/* Department Name & Member Count */}
                      <div
                        className="flex items-center gap-2 cursor-pointer min-w-0 flex-1"
                        onClick={() => toggleExpand(dept.id)}
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {dept.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4.5 px-1.5 shrink-0 font-medium"
                        >
                          {totalCount} {totalCount === 1 ? "member" : "members"}
                        </Badge>
                      </div>
                    </div>

                    {/* Right side: Selected indicator and Expand toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          isAllSelected
                            ? "bg-primary/10 text-primary"
                            : isIndeterminate
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {selectedCount} of {totalCount} selected
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpand(dept.id)}
                        title={isExpanded ? "Collapse" : "Expand to view and customize employees"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Employee List (Loaded On Demand) */}
                  {isExpanded && (
                    <div className="p-3 pt-2 border-t bg-card/60 space-y-1.5">
                      {isLoadingMembers ? (
                        <div className="flex items-center justify-center p-4 text-xs text-muted-foreground gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span>Loading employees in {dept.name}...</span>
                        </div>
                      ) : !members || members.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2 px-1">
                          No employees assigned to this department.
                        </p>
                      ) : (
                        <>
                          {/* Quick sub-actions for this department */}
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1 px-1 border-b border-border/40">
                            <span>Employees in {dept.name} ({members.length})</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  // Mark all members in this dept as included
                                  setSelectedDeptIds((prev) => new Set(prev).add(dept.id))
                                  const memberIds = new Set(members.map((m) => m.id))
                                  setExcludedProfileIds((prev) => {
                                    const next = new Set(prev)
                                    for (const id of memberIds) next.delete(id)
                                    return next
                                  })
                                }}
                                className="text-primary hover:underline font-medium"
                              >
                                Select all in dept
                              </button>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={() => {
                                  // Mark all members in this dept as excluded
                                  setSelectedDeptIds((prev) => {
                                    const next = new Set(prev)
                                    next.delete(dept.id)
                                    return next
                                  })
                                  const memberIds = new Set(members.map((m) => m.id))
                                  setIncludedProfileIds((prev) => {
                                    const next = new Set(prev)
                                    for (const id of memberIds) next.delete(id)
                                    return next
                                  })
                                }}
                                className="text-muted-foreground hover:text-destructive font-medium"
                              >
                                Deselect all
                              </button>
                            </div>
                          </div>

                          {/* Employee items grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 max-h-[220px] overflow-y-auto pr-1">
                            {members.map((emp) => {
                              const isChecked = isEmployeeSelected(dept.id, emp.id)
                              const fullName =
                                `${emp.given_name || ""} ${emp.last_name || ""}`.trim() ||
                                emp.email ||
                                "Employee"

                              return (
                                <label
                                  key={emp.id}
                                  htmlFor={`emp-cb-${dept.id}-${emp.id}`}
                                  className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                                    isChecked
                                      ? "border-primary/50 bg-primary/[0.04] shadow-2xs"
                                      : "border-border/60 hover:bg-muted/30"
                                  }`}
                                >
                                  <div className="pt-0.5">
                                    <Checkbox
                                      id={`emp-cb-${dept.id}-${emp.id}`}
                                      checked={isChecked}
                                      disabled={isSaving}
                                      onCheckedChange={() =>
                                        handleEmployeeToggle(dept.id, emp.id)
                                      }
                                    />
                                  </div>

                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-foreground truncate">
                                        {fullName}
                                      </span>
                                      {emp.job_title && (
                                        <span className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                                          <Briefcase className="h-2.5 w-2.5 shrink-0" />
                                          {emp.job_title}
                                        </span>
                                      )}
                                    </div>

                                    {emp.email && (
                                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                        <Mail className="h-2.5 w-2.5 shrink-0" />
                                        {emp.email}
                                      </p>
                                    )}
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Dialog Footer with Selection Counter and Save Button */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-between sm:justify-between w-full">
          {/* Live selection counter badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs py-1 px-2.5 font-semibold bg-background border-border/80"
            >
              <Users className="h-3.5 w-3.5 mr-1.5 text-primary" />
              {totalSelectedEmployees}{" "}
              {totalSelectedEmployees === 1 ? "employee" : "employees"} across{" "}
              {selectedDepartmentCount}{" "}
              {selectedDepartmentCount === 1 ? "department" : "departments"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !capabilityId || isLoadingStatus}
              className="gap-1.5 font-semibold shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Assignments"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
