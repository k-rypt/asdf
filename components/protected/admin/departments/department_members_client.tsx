"use client"

import { useState } from "react"
import { formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CheckSquare, Square, Search, ArrowRightLeft, UserPlus, UserMinus, Edit, XCircle, RotateCcw, AlertTriangle, EllipsisVertical } from "lucide-react"
import { toast } from "@/components/ui/toast"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { errorMessage, type CapabilityLink, type DepartmentMember, type DepartmentOption, type DepartmentProfile } from "./department-types"
import { DepartmentCapabilitiesChart } from "./department_capabilities_chart"
import { DepartmentGrowthChart } from "./department_growth_chart"
import { DepartmentRatioCards } from "./department_ratio_cards"
import { planMembershipChange, type MembershipStatus } from "@/lib/admin/department-membership"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogFooter 
} from "@/components/ui/dialog"
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select"

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without this, the closed
// trigger shows e.g. "alphabetical" instead of "Alphabetical (A-Z)".
const MEMBER_SORT_OPTIONS = [
    { value: "alphabetical", label: "Alphabetical (A-Z)" },
    { value: "capabilities", label: "Most Capabilities" },
    { value: "recent", label: "Recently Added" },
    { value: "oldest", label: "Oldest Added" },
]

/** A profile_departments row to insert. */
interface MembershipInsert {
    department_id: string
    profile_id: string
    status: 'assessment' | 'management'
    added_by: string
    added_at: string
}

interface DepartmentMembersClientProps {
    departmentMembers: DepartmentMember[]
    allDepartments: DepartmentOption[]
    currentDepartmentId: string
    unassignedProfiles: DepartmentProfile[]
    departmentInfo: {
        id: string
        name: string
        description: string
        created_at: string | null
        creatorName: string
        last_updated: string | null
        updaterName: string
        status: 'active' | 'closed'
    }
    /** Dialog to open on arrival (from the catalogue card's menu). */
    initialAction?: 'edit' | 'close'
}

export function DepartmentMembersClient({ 
    departmentMembers, 
    allDepartments, 
    currentDepartmentId,
    unassignedProfiles,
    departmentInfo,
    initialAction
}: DepartmentMembersClientProps) {
    const router = useRouter()
    const supabase = createClient()
    
    // Warning logic
    const managersCount = departmentMembers.filter(m => m.status === 'management').length
    const employeesCount = departmentMembers.filter(m => m.status === 'assessment').length
    
    const isMissingManager = managersCount === 0 && employeesCount > 0
    const isMissingEmployee = employeesCount === 0 && managersCount > 0

    const isClosed = departmentInfo.status === 'closed'

    // Shared by the close-department "Target Department" select and the
    // Transfer Profiles select below -- also doubles as the `items` map
    // Base UI's <SelectValue> needs to show a department's name instead of
    // its raw id in the closed trigger.
    const transferableDepartmentOptions = allDepartments
        .filter((d) => d.id !== currentDepartmentId && d.status !== 'closed')
        .map((d) => ({ value: d.id, label: d.name }))

    const updateDepartmentMetadata = async (departmentIds: string[], userId: string) => {
        const { error } = await supabase
            .from('departments')
            .update({
                last_updated: new Date().toISOString(),
                updated_by: userId
            })
            .in('id', departmentIds)
            
        if (error) {
            console.error("Failed to update department metadata:", error)
        }
    }

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState("")

    // Edit Department Modal State
    const [isEditDeptModalOpen, setIsEditDeptModalOpen] = useState(initialAction === 'edit' && !isClosed)
    const [editDeptName, setEditDeptName] = useState(departmentInfo.name)
    const [editDeptDescription, setEditDeptDescription] = useState(departmentInfo.description)
    const [isEditingDept, setIsEditingDept] = useState(false)

    // Close Department Modal State
    const [isCloseModalOpen, setIsCloseModalOpen] = useState(initialAction === 'close' && !isClosed)
    const [evacuationAction, setEvacuationAction] = useState<"transfer" | "unassign">("unassign")
    const [closeTargetDeptId, setCloseTargetDeptId] = useState("")
    const [isClosing, setIsClosing] = useState(false)
    const [isReactivating, setIsReactivating] = useState(false)

    const hasMembers = departmentMembers.length > 0

    const handleCloseDepartment = async () => {
        if (hasMembers && evacuationAction === "transfer" && !closeTargetDeptId) {
            toast.add({ title: "Error", description: "Please select a target department for the transfer.", type: "error" })
            return
        }

        setIsClosing(true)
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) throw new Error("Unable to identify the current user.")
            const currentUserId = authData.user.id

            if (hasMembers) {
                if (evacuationAction === "transfer") {
                    // Transfer all members to the target department (retain statuses)
                    const { error: transferError } = await supabase
                        .from('profile_departments')
                        .update({ department_id: closeTargetDeptId })
                        .eq('department_id', currentDepartmentId)

                    if (transferError) throw transferError

                    // Update metadata for the target department too
                    await updateDepartmentMetadata([closeTargetDeptId], currentUserId)
                } else {
                    // Unassign all members
                    const { error: deleteError } = await supabase
                        .from('profile_departments')
                        .delete()
                        .eq('department_id', currentDepartmentId)

                    if (deleteError) throw deleteError
                }
            }

            // Mark department as closed
            const { error: closeError } = await supabase
                .from('departments')
                .update({
                    status: 'closed',
                    last_updated: new Date().toISOString(),
                    updated_by: currentUserId
                })
                .eq('id', currentDepartmentId)

            if (closeError) throw closeError

            toast.add({
                title: "Department Closed",
                description: `"${departmentInfo.name}" has been successfully closed.`,
                type: "success"
            })
            setIsCloseModalOpen(false)
            router.push('/protected/admin/departments')
        } catch (error) {
            console.error("Close Department Error:", error)
            toast.add({
                title: "Close Failed",
                description: errorMessage(error) || "An unexpected error occurred.",
                type: "error"
            })
        } finally {
            setIsClosing(false)
        }
    }

    const handleReactivate = async () => {
        setIsReactivating(true)
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) throw new Error("Unable to identify the current user.")

            const { error } = await supabase
                .from('departments')
                .update({
                    status: 'active',
                    last_updated: new Date().toISOString(),
                    updated_by: authData.user.id
                })
                .eq('id', currentDepartmentId)

            if (error) throw error

            toast.add({
                title: "Department Reactivated",
                description: `"${departmentInfo.name}" is now active again.`,
                type: "success"
            })
            router.refresh()
        } catch (error) {
            console.error("Reactivate Error:", error)
            toast.add({
                title: "Reactivation Failed",
                description: errorMessage(error) || "An unexpected error occurred.",
                type: "error"
            })
        } finally {
            setIsReactivating(false)
        }
    }

    const handleEditDepartment = async () => {
        if (!editDeptName.trim()) {
            toast.add({ title: "Error", description: "Department name cannot be empty.", type: "error" })
            return
        }

        setIsEditingDept(true)
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) {
                throw new Error("Unable to identify the current user.")
            }
            
            const { error } = await supabase
                .from('departments')
                .update({ 
                    name: editDeptName.trim(), 
                    description: editDeptDescription.trim(),
                    last_updated: new Date().toISOString(),
                    updated_by: authData.user.id
                })
                .eq('id', currentDepartmentId)

            if (error) throw error

            toast.add({ title: "Success", description: "Department details updated.", type: "success" })
            setIsEditDeptModalOpen(false)
            router.refresh()
        } catch (error) {
            console.error("Edit Department Error:", error)
            toast.add({ title: "Update Failed", description: errorMessage(error) || "An unexpected error occurred.", type: "error" })
        } finally {
            setIsEditingDept(false)
        }
    }

    // Transfer Modal State
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [targetDepartmentId, setTargetDepartmentId] = useState("")
    const [keepCapabilities, setKeepCapabilities] = useState(true)
    const [statusAction, setStatusAction] = useState<"retain" | "assessment" | "management">("retain")
    const [isTransferring, setIsTransferring] = useState(false)

    // Include Modal State
    const [isIncludeModalOpen, setIsIncludeModalOpen] = useState(false)
    const [includeSearchQuery, setIncludeSearchQuery] = useState("")
    const [includeSelectedIds, setIncludeSelectedIds] = useState<Set<string>>(new Set())
    const [assignAsAssessment, setAssignAsAssessment] = useState(true)
    const [assignAsManagement, setAssignAsManagement] = useState(false)
    const [isIncluding, setIsIncluding] = useState(false)

    // Change Status Modal State
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
    const [changeAsAssessment, setChangeAsAssessment] = useState(true)
    const [changeAsManagement, setChangeAsManagement] = useState(false)
    const [isChangingStatus, setIsChangingStatus] = useState(false)

    const openStatusModal = () => {
        // We can try to intelligently pre-fill if exactly 1 user is selected
        if (selectedIds.size === 1) {
            const profileId = Array.from(selectedIds)[0]
            const statuses = departmentMembers
                .filter(m => {
                    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
                    return p?.id === profileId
                })
                .map(m => m.status)
            
            setChangeAsAssessment(statuses.includes('assessment'))
            setChangeAsManagement(statuses.includes('management'))
        } else {
            setChangeAsAssessment(true)
            setChangeAsManagement(false)
        }
        setIsStatusModalOpen(true)
    }

    const handleChangeStatus = async () => {
        if (!changeAsAssessment && !changeAsManagement) {
            toast.add({ title: "Error", description: "Please select at least one status (Assessment or Management).", type: "error" })
            return
        }

        setIsChangingStatus(true)
        const profileIds = Array.from(selectedIds)

        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) {
                throw new Error("Unable to identify the current user.")
            }
            const currentUserId = authData.user.id

            const toInsert: MembershipInsert[] = []
            const toDelete: { profile_id: string, status: string }[] = []

            profileIds.forEach(profileId => {
                const currentStatuses = departmentMembers
                    .filter(m => {
                        const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
                        return p?.id === profileId
                    })
                    .map(m => m.status)
                    
                const hasAssessment = currentStatuses.includes('assessment')
                const hasManagement = currentStatuses.includes('management')
                
                // Assessment diff
                if (changeAsAssessment && !hasAssessment) {
                    toInsert.push({ 
                        department_id: currentDepartmentId, 
                        profile_id: profileId, 
                        status: 'assessment', 
                        added_by: currentUserId, 
                        added_at: new Date().toISOString() 
                    })
                } else if (!changeAsAssessment && hasAssessment) {
                    toDelete.push({ profile_id: profileId, status: 'assessment' })
                }
                
                // Management diff
                if (changeAsManagement && !hasManagement) {
                    toInsert.push({ 
                        department_id: currentDepartmentId, 
                        profile_id: profileId, 
                        status: 'management', 
                        added_by: currentUserId, 
                        added_at: new Date().toISOString() 
                    })
                } else if (!changeAsManagement && hasManagement) {
                    toDelete.push({ profile_id: profileId, status: 'management' })
                }
            })

            // Execute Deletes
            if (toDelete.length > 0) {
                await Promise.all(toDelete.map(del => 
                    supabase.from('profile_departments')
                        .delete()
                        .match({ 
                            department_id: currentDepartmentId, 
                            profile_id: del.profile_id, 
                            status: del.status 
                        })
                ))
            }

            // Execute Inserts
            if (toInsert.length > 0) {
                const { error: insertError } = await supabase.from('profile_departments').insert(toInsert)
                if (insertError) throw insertError
            }

            // Update department metadata
            if (toDelete.length > 0 || toInsert.length > 0) {
                await updateDepartmentMetadata([currentDepartmentId], currentUserId)
            }

            toast.add({ 
                title: "Status Updated", 
                description: `Successfully updated the status of ${profileIds.length} profile(s).`,
                type: "success" 
            })

            setSelectedIds(new Set())
            setIsStatusModalOpen(false)
            router.refresh()

        } catch (error) {
            console.error("Change Status Error:", error)
            toast.add({ 
                title: "Update Failed", 
                description: errorMessage(error) || "An unexpected error occurred.", 
                type: "error" 
            })
        } finally {
            setIsChangingStatus(false)
        }
    }

    const handleTransfer = async () => {
        if (!targetDepartmentId) {
            toast.add({ title: "Error", description: "Please select a target department.", type: "error" })
            return
        }

        setIsTransferring(true)
        const profileIds = Array.from(selectedIds)

        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) {
                throw new Error("Unable to identify the current user.")
            }
            const currentUserId = authData.user.id

            if (!keepCapabilities) {
                const { error: capError } = await supabase
                    .from('profile_capabilities')
                    .delete()
                    .in('profile_id', profileIds)

                if (capError) throw capError
            }

            if (statusAction === "retain") {
                // Safe to just update the department ID because they retain their distinct roles
                const { error: transferError } = await supabase
                    .from('profile_departments')
                    .update({ department_id: targetDepartmentId })
                    .eq('department_id', currentDepartmentId)
                    .in('profile_id', profileIds)

                if (transferError) throw transferError
            } else {
                // If coercing status (e.g. all to Assessment), a user with dual roles would cause a duplicate key on UPDATE.
                // To solve this, we delete their existing records in the current dept and insert a single clean record in the target dept.
                const { error: delError } = await supabase
                    .from('profile_departments')
                    .delete()
                    .eq('department_id', currentDepartmentId)
                    .in('profile_id', profileIds)
                
                if (delError) throw delError

                const rowsToInsert = profileIds.map(profileId => ({
                    department_id: targetDepartmentId,
                    profile_id: profileId,
                    status: statusAction,
                    added_by: currentUserId,
                    added_at: new Date().toISOString()
                }))

                const { error: insError } = await supabase
                    .from('profile_departments')
                    .insert(rowsToInsert)

                if (insError) throw insError
            }

            await updateDepartmentMetadata([currentDepartmentId, targetDepartmentId], currentUserId)

            toast.add({ 
                title: "Transfer Complete", 
                description: `Successfully transferred ${profileIds.length} profiles.`,
                type: "success" 
            })

            setSelectedIds(new Set())
            setIsTransferModalOpen(false)
            router.refresh()
            
        } catch (error) {
            console.error("Transfer Error:", error)
            toast.add({ 
                title: "Transfer Failed", 
                description: errorMessage(error) || "An unexpected error occurred.", 
                type: "error" 
            })
        } finally {
            setIsTransferring(false)
        }
    }

    const handleInclude = async () => {
        if (includeSelectedIds.size === 0) {
            toast.add({ title: "Error", description: "Please select at least one profile to include.", type: "error" })
            return
        }

        if (!assignAsAssessment && !assignAsManagement) {
            toast.add({ title: "Error", description: "Please select at least one role (Assessment or Management).", type: "error" })
            return
        }

        setIsIncluding(true)
        
        try {
            const { data: authData, error: authError } = await supabase.auth.getUser()
            if (authError || !authData.user) {
                throw new Error("Unable to identify the current user.")
            }
            
            const currentUserId = authData.user.id
            const profileIds = Array.from(includeSelectedIds)
            
            const payload: MembershipInsert[] = []
            
            profileIds.forEach(profileId => {
                if (assignAsAssessment) {
                    payload.push({
                        department_id: currentDepartmentId,
                        profile_id: profileId,
                        status: 'assessment',
                        added_by: currentUserId,
                        added_at: new Date().toISOString()
                    })
                }
                if (assignAsManagement) {
                    payload.push({
                        department_id: currentDepartmentId,
                        profile_id: profileId,
                        status: 'management',
                        added_by: currentUserId,
                        added_at: new Date().toISOString()
                    })
                }
            })

            const { error: insertError } = await supabase
                .from('profile_departments')
                .insert(payload)

            if (insertError) throw insertError

            await updateDepartmentMetadata([currentDepartmentId], currentUserId)

            toast.add({ 
                title: "Inclusion Complete", 
                description: `Successfully added ${profileIds.length} profiles to the department.`,
                type: "success" 
            })

            setIncludeSelectedIds(new Set())
            setIncludeSearchQuery("")
            setIsIncludeModalOpen(false)
            router.refresh()
            
        } catch (error) {
            console.error("Include Error:", error)
            toast.add({ 
                title: "Include Failed", 
                description: errorMessage(error) || "An unexpected error occurred.", 
                type: "error" 
            })
        } finally {
            setIsIncluding(false)
        }
    }

    // Make manager / Remove as manager / Remove from department
    const [memberAction, setMemberAction] = useState<{ kind: "promote" | "demote" | "remove", profileIds: string[] } | null>(null)
    const [replacementId, setReplacementId] = useState("")
    const [isApplyingMemberAction, setIsApplyingMemberAction] = useState(false)

    const membershipRows = departmentMembers.flatMap(m => {
        const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
        return p?.id ? [{ profileId: p.id, status: m.status as MembershipStatus }] : []
    })

    const nameOf = (profileId: string) => {
        const member = departmentMembers.find(m => {
            const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
            return p?.id === profileId
        })
        const p = Array.isArray(member?.profile) ? member?.profile[0] : member?.profile
        const name = `${p?.given_name || ""} ${p?.last_name || ""}`.trim()
        return name || p?.email || "this person"
    }

    const listNames = (profileIds: string[]) =>
        profileIds.length === 1 ? nameOf(profileIds[0]) : `${profileIds.length} people`

    const openMemberAction = (kind: "promote" | "demote" | "remove", profileIds: string[]) => {
        setReplacementId("")
        setMemberAction({ kind, profileIds })
    }

    // Same rules the server applies; only used here to warn before confirming.
    const memberActionPreview = memberAction
        ? planMembershipChange({
            request: memberAction.kind === "demote"
                ? { action: "demote", profileIds: memberAction.profileIds, replacementId: replacementId || null }
                : { action: memberAction.kind, profileIds: memberAction.profileIds },
            departmentClosed: false,
            rows: membershipRows,
            roleIdsByProfile: {},
            archivedProfileIds: [],
        })
        : null

    const replacementOptions = memberAction?.kind === "demote"
        ? [
            { value: "", label: "No replacement" },
            ...membershipRows
                .filter(r => r.status === "assessment" && !memberAction.profileIds.includes(r.profileId))
                .filter(r => !membershipRows.some(o => o.profileId === r.profileId && o.status === "management"))
                .map(r => ({ value: r.profileId, label: nameOf(r.profileId) })),
        ]
        : []

    const handleMemberAction = async () => {
        if (!memberAction) return
        setIsApplyingMemberAction(true)
        try {
            const res = await fetch(`/api/admin/departments/${currentDepartmentId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: memberAction.kind,
                    profileIds: memberAction.profileIds,
                    replacementId: memberAction.kind === "demote" ? replacementId || null : undefined,
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error ?? "Failed to update department members.")

            const who = listNames(memberAction.profileIds)
            const done = {
                promote: `${who} ${memberAction.profileIds.length === 1 ? "is" : "are"} now managing this department.`,
                demote: replacementId
                    ? `${nameOf(replacementId)} replaced ${who} as manager.`
                    : `${who} moved back to Assessment Profiles.`,
                remove: `${who} removed from ${departmentInfo.name}.`,
            }[memberAction.kind]
            const granted = (data.grantedManagerRole ?? []) as string[]
            const noLongerManaging = (data.noLongerManaging ?? []) as string[]
            const notes: string[] = []
            if (granted.length > 0) {
                notes.push(`Gave ${granted.map(nameOf).join(", ")} the Manager role.`)
            }
            if (noLongerManaging.length > 0) {
                const one = noLongerManaging.length === 1
                notes.push(`${noLongerManaging.map(nameOf).join(", ")} no longer manage${one ? "s" : ""} any department but still ${one ? "has" : "have"} the Manager role. You can remove it in Users.`)
            }

            toast.add({ title: "Department updated", description: [done, ...notes].join(" "), type: "success" })
            setSelectedIds(new Set())
            setMemberAction(null)
            router.refresh()
        } catch (error) {
            toast.add({
                title: "Update Failed",
                description: errorMessage(error) || "An unexpected error occurred.",
                type: "error"
            })
        } finally {
            setIsApplyingMemberAction(false)
        }
    }

    const [managementSort, setManagementSort] = useState("alphabetical")
    const [assessmentSort, setAssessmentSort] = useState("alphabetical")

    // Filter main tables
    const filteredMembers = departmentMembers?.filter(member => {
        if (!searchQuery.trim()) return true
        
        const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile
        if (!profile) return false
        
        const query = searchQuery.toLowerCase().trim()
        
        const givenName = (profile.given_name || "").toLowerCase()
        const lastName = (profile.last_name || "").toLowerCase()
        const email = (profile.email || "").toLowerCase()
        const jobTitle = (profile.job_title || "").toLowerCase()
        
        const caps = profile.profile_capabilities || []
        const capabilityNames = caps
            .map((pc: CapabilityLink) => pc.capabilities?.name?.toLowerCase())
            .filter((name): name is string => Boolean(name))
            
        return (
            givenName.includes(query) ||
            lastName.includes(query) ||
            email.includes(query) ||
            jobTitle.includes(query) ||
            capabilityNames.some((cap: string) => cap.includes(query))
        )
    }) || []

    const sortMembers = (members: DepartmentMember[], sortType: string) => {
        return [...members].sort((a, b) => {
            const profileA = Array.isArray(a.profile) ? a.profile[0] : a.profile
            const profileB = Array.isArray(b.profile) ? b.profile[0] : b.profile
            
            switch (sortType) {
                case "alphabetical": {
                    const nameA = `${profileA?.given_name || ""} ${profileA?.last_name || ""}`.trim().toLowerCase()
                    const nameB = `${profileB?.given_name || ""} ${profileB?.last_name || ""}`.trim().toLowerCase()
                    return nameA.localeCompare(nameB)
                }
                case "capabilities": {
                    const capsA = profileA?.profile_capabilities?.length || 0
                    const capsB = profileB?.profile_capabilities?.length || 0
                    return capsB - capsA // Descending
                }
                case "recent": {
                    const timeA = new Date(a.added_at ?? 0).getTime()
                    const timeB = new Date(b.added_at ?? 0).getTime()
                    return timeB - timeA // Descending (recent first)
                }
                case "oldest": {
                    const timeA = new Date(a.added_at ?? 0).getTime()
                    const timeB = new Date(b.added_at ?? 0).getTime()
                    return timeA - timeB // Ascending (oldest first)
                }
                default:
                    return 0
            }
        })
    }

    const managers = sortMembers(filteredMembers.filter(m => m.status === 'management'), managementSort)
    const assessments = sortMembers(filteredMembers.filter(m => m.status === 'assessment'), assessmentSort)

    // Filter unassigned profiles
    const filteredUnassigned = unassignedProfiles?.filter(profile => {
        if (!includeSearchQuery.trim()) return true
        const query = includeSearchQuery.toLowerCase().trim()
        
        const givenName = (profile.given_name || "").toLowerCase()
        const lastName = (profile.last_name || "").toLowerCase()
        const email = (profile.email || "").toLowerCase()
        const jobTitle = (profile.job_title || "").toLowerCase()
        
        const caps = profile.profile_capabilities || []
        const capabilityNames = caps
            .map((pc: CapabilityLink) => pc.capabilities?.name?.toLowerCase())
            .filter((name): name is string => Boolean(name))
            
        return (
            givenName.includes(query) ||
            lastName.includes(query) ||
            email.includes(query) ||
            jobTitle.includes(query) ||
            capabilityNames.some((cap: string) => cap.includes(query))
        )
    }) || []

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedIds(newSelected)
    }

    const selectAll = () => {
        const visibleIds = filteredMembers
            .map(m => {
                const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
                return p?.id
            })
            .filter(Boolean) as string[]
        setSelectedIds(new Set(visibleIds))
    }

    const unselectAll = () => setSelectedIds(new Set())

    const toggleIncludeSelection = (id: string) => {
        const newSelected = new Set(includeSelectedIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setIncludeSelectedIds(newSelected)
    }

    const selectAllInclude = () => {
        const visibleIds = filteredUnassigned.map(p => p.id).filter(Boolean)
        setIncludeSelectedIds(new Set(visibleIds))
    }

    const unselectAllInclude = () => setIncludeSelectedIds(new Set())

    const renderCapabilities = (profile: DepartmentProfile | null | undefined) => {
        const caps = profile?.profile_capabilities || []
        const capabilityNames = caps
            .map((pc: CapabilityLink) => pc.capabilities?.name)
            .filter((name): name is string => Boolean(name))

        if (capabilityNames.length === 0) {
            return <span className="text-muted-foreground text-xs italic">None</span>
        }

        return (
            <div className="flex flex-wrap gap-1">
                {capabilityNames.map((name: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs font-normal">
                        {name}
                    </Badge>
                ))}
            </div>
        )
    }

    const renderTable = (
        title: string, 
        members: DepartmentMember[], 
        sortValue: string,
        onSortChange: (val: string) => void,
        kind: MembershipStatus
    ) => (
        <section>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                <h2 className="text-xl font-semibold">{title}</h2>
                <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground whitespace-nowrap text-xs">Sort by:</Label>
                    <Select value={sortValue} onValueChange={(value) => value && onSortChange(value)} items={MEMBER_SORT_OPTIONS}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                            <SelectValue placeholder="Sort..." />
                        </SelectTrigger>
                        <SelectContent>
                            {MEMBER_SORT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            
            <div className="rounded-md border bg-card overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                            <th className="px-4 py-3 font-medium w-12 text-center"></th>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Email</th>
                            <th className="px-4 py-3 font-medium">Job Title</th>
                            <th className="px-4 py-3 font-medium">Capabilities</th>
                            <th className="px-4 py-3 font-medium">Added By</th>
                            <th className="px-4 py-3 font-medium">Added On</th>
                            {!isClosed && <th className="px-2 py-3 w-12"><span className="sr-only">Actions</span></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {members.length === 0 ? (
                            <tr>
                                <td colSpan={isClosed ? 7 : 8} className="px-4 py-8 text-center text-muted-foreground">
                                    No {title.toLowerCase()} found.
                                </td>
                            </tr>
                        ) : (
                            members.map((member, idx) => {
                                const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
                                const adder = Array.isArray(member.adder) ? member.adder[0] : member.adder;
                                const profileId = profile?.id;
                                const isChecked = profileId ? selectedIds.has(profileId) : false;
                                
                                return (
                                    <tr key={idx} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 text-center align-middle">
                                            {profileId && (
                                                <Checkbox 
                                                    aria-label={`Select ${profile?.given_name}`}
                                                    checked={isChecked}
                                                    onCheckedChange={() => toggleSelection(profileId)}
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-medium">{profile?.given_name} {profile?.last_name}</td>
                                        <td className="px-4 py-3">{profile?.email}</td>
                                        <td className="px-4 py-3">{profile?.job_title || "N/A"}</td>
                                        <td className="px-4 py-3 max-w-[200px]">{renderCapabilities(profile)}</td>
                                        <td className="px-4 py-3">{adder ? `${adder.given_name} ${adder.last_name}` : "N/A"}</td>
                                        <td className="px-4 py-3">{formatDate(member.added_at, true)}</td>
                                        {!isClosed && (
                                            <td className="px-2 py-3 text-right">
                                                {profileId && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger
                                                            render={
                                                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${nameOf(profileId)}`}>
                                                                    <EllipsisVertical className="h-4 w-4" />
                                                                </Button>
                                                            }
                                                        />
                                                        <DropdownMenuContent align="end">
                                                            {kind === "assessment" ? (
                                                                <DropdownMenuItem className="cursor-pointer" onClick={() => openMemberAction("promote", [profileId])}>
                                                                    Make manager
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem className="cursor-pointer" onClick={() => openMemberAction("demote", [profileId])}>
                                                                    Remove as manager
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                                                                onClick={() => openMemberAction("remove", [profileId])}
                                                            >
                                                                Remove from department
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )

    return (
        <div className="flex flex-col gap-10">
            {/* Page Header Area */}
            <header className="flex flex-col gap-2 border-b pb-6 relative group">
                <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight">{departmentInfo.name}</h1>
                        {isClosed && (
                            <Badge variant="destructive" className="text-sm">Closed</Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {!isClosed && (
                            <>
                                <Button variant="outline" size="sm" onClick={() => {
                                    setEditDeptName(departmentInfo.name)
                                    setEditDeptDescription(departmentInfo.description || "")
                                    setIsEditDeptModalOpen(true)
                                }}>
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit Details
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => {
                                    setEvacuationAction("unassign")
                                    setCloseTargetDeptId("")
                                    setIsCloseModalOpen(true)
                                }}>
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Close Department
                                </Button>
                            </>
                        )}
                        {isClosed && (
                            <Button size="sm" onClick={handleReactivate} disabled={isReactivating}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {isReactivating ? "Reactivating..." : "Reactivate"}
                            </Button>
                        )}
                    </div>
                </div>
                <p className="text-muted-foreground mt-2">{departmentInfo.description || "No description available"}</p>
                {departmentInfo.created_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Created on {formatDate(departmentInfo.created_at)} by {departmentInfo.creatorName}
                    </p>
                )}
                {departmentInfo.last_updated && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Last updated on {formatDate(departmentInfo.last_updated)} by {departmentInfo.updaterName}
                    </p>
                )}
            </header>

            {(isMissingManager || isMissingEmployee) && (
                <div className="bg-destructive/15 text-destructive border border-destructive/20 rounded-md p-4 mb-6 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-1 text-sm">
                        <p className="font-medium">Action Required</p>
                        <p>
                            {isMissingManager 
                                ? "This department has employees but no assigned managers."
                                : "This department has managers but no assigned employees."}
                        </p>
                    </div>
                </div>
            )}

            <DepartmentRatioCards departmentMembers={departmentMembers} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <DepartmentGrowthChart departmentMembers={departmentMembers} />
                <DepartmentCapabilitiesChart departmentMembers={departmentMembers} />
            </div>

            {/* Toolbar: Search and Bulk Actions */}
            {!isClosed && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex flex-wrap items-center gap-4">
                    <Button variant="outline" size="sm" onClick={selectAll}>
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={unselectAll}>
                        <Square className="w-4 h-4 mr-2" />
                        Unselect All
                    </Button>

                    {selectedIds.size > 0 && (
                        <>
                            <span className="text-sm text-muted-foreground border-l pl-4 hidden sm:inline-block">
                                {selectedIds.size} selected
                            </span>
                            <Button size="sm" onClick={openStatusModal}>
                                <ArrowRightLeft className="w-4 h-4 mr-2" />
                                Change Status
                            </Button>
                            <Button size="sm" onClick={() => setIsTransferModalOpen(true)}>
                                <ArrowRightLeft className="w-4 h-4 mr-2" />
                                Transfer
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openMemberAction("remove", Array.from(selectedIds))}>
                                <UserMinus className="w-4 h-4 mr-2" />
                                Remove from department
                            </Button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search profiles..."
                            className="pl-8 bg-card"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    <Button size="sm" onClick={() => setIsIncludeModalOpen(true)}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Include Members
                    </Button>
                </div>
            </div>
            )}

            {renderTable("Management Profiles", managers, managementSort, setManagementSort, "management")}
            {renderTable("Assessment Profiles", assessments, assessmentSort, setAssessmentSort, "assessment")}

            {/* Close Department Dialog (Evacuation Wizard) */}
            <Dialog open={isCloseModalOpen} onOpenChange={setIsCloseModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Close Department</DialogTitle>
                        <DialogDescription>
                            {hasMembers 
                                ? `This department has ${departmentMembers.length} member record(s). Choose how to handle them before closing.`
                                : `This department has no members. Are you sure you want to close "${departmentInfo.name}"?`
                            }
                        </DialogDescription>
                    </DialogHeader>
                    
                    {hasMembers && (
                        <div className="flex flex-col gap-4 py-4">
                            <div className="flex flex-col gap-3">
                                <Label>Member Handling</Label>
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="evacuationAction"
                                            value="unassign"
                                            checked={evacuationAction === "unassign"}
                                            onChange={() => setEvacuationAction("unassign")}
                                            className="h-4 w-4 text-primary"
                                        />
                                        Unassign all members (return them to the unassigned pool)
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="evacuationAction"
                                            value="transfer"
                                            checked={evacuationAction === "transfer"}
                                            onChange={() => setEvacuationAction("transfer")}
                                            className="h-4 w-4 text-primary"
                                        />
                                        Transfer all members to another department
                                    </label>
                                </div>
                            </div>

                            {evacuationAction === "transfer" && (
                                <div className="flex flex-col gap-2">
                                    <Label>Target Department</Label>
                                    <Select onValueChange={(value) => value && setCloseTargetDeptId(value)} value={closeTargetDeptId} items={transferableDepartmentOptions}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {transferableDepartmentOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCloseModalOpen(false)} disabled={isClosing}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleCloseDepartment} disabled={isClosing}>
                            {isClosing ? "Closing..." : "Confirm Close"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Department Dialog */}
            <Dialog open={isEditDeptModalOpen} onOpenChange={setIsEditDeptModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Department Details</DialogTitle>
                        <DialogDescription>
                            Update the name and description of this department.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="dept-name">Department Name</Label>
                            <Input 
                                id="dept-name" 
                                value={editDeptName} 
                                onChange={(e) => setEditDeptName(e.target.value)} 
                                placeholder="Enter department name"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="dept-desc">Description</Label>
                            <Textarea 
                                id="dept-desc" 
                                value={editDeptDescription} 
                                onChange={(e) => setEditDeptDescription(e.target.value)} 
                                placeholder="Enter department description"
                                rows={4}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditDeptModalOpen(false)} disabled={isEditingDept}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditDepartment} disabled={isEditingDept}>
                            {isEditingDept ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Status Dialog */}
            <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Member Status</DialogTitle>
                        <DialogDescription>
                            Update the department role for {selectedIds.size} selected profile(s).
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col gap-6 py-4">
                        <div className="flex flex-col gap-3">
                            <Label>Assign As</Label>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        id="change-assessment" 
                                        checked={changeAsAssessment} 
                                        onCheckedChange={(c) => setChangeAsAssessment(c as boolean)} 
                                    />
                                    <Label htmlFor="change-assessment" className="font-normal cursor-pointer">
                                        Employee (Assessment)
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        id="change-management" 
                                        checked={changeAsManagement} 
                                        onCheckedChange={(c) => setChangeAsManagement(c as boolean)} 
                                    />
                                    <Label htmlFor="change-management" className="font-normal cursor-pointer">
                                        Manager
                                    </Label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStatusModalOpen(false)} disabled={isChangingStatus}>
                            Cancel
                        </Button>
                        <Button onClick={handleChangeStatus} disabled={isChangingStatus}>
                            {isChangingStatus ? "Updating..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Transfer Dialog */}
            <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Transfer Profiles</DialogTitle>
                        <DialogDescription>
                            You are about to move {selectedIds.size} profile(s) to another department.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col gap-6 py-4">
                        <div className="flex flex-col gap-2">
                            <Label>Target Department</Label>
                            <Select onValueChange={(value) => value && setTargetDepartmentId(value)} value={targetDepartmentId} items={transferableDepartmentOptions}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {transferableDepartmentOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox 
                                id="keep-capabilities" 
                                checked={keepCapabilities} 
                                onCheckedChange={(c) => setKeepCapabilities(c as boolean)} 
                            />
                            <Label htmlFor="keep-capabilities" className="font-normal cursor-pointer">
                                Keep existing capabilities assigned to these profiles
                            </Label>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Label>Status Handling</Label>
                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="statusAction"
                                        value="retain"
                                        checked={statusAction === "retain"}
                                        onChange={() => setStatusAction("retain")}
                                        className="h-4 w-4 text-primary"
                                    />
                                    Retain current status
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="statusAction"
                                        value="assessment"
                                        checked={statusAction === "assessment"}
                                        onChange={() => setStatusAction("assessment")}
                                        className="h-4 w-4 text-primary"
                                    />
                                    Set all as Employee (Assessment)
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="statusAction"
                                        value="management"
                                        checked={statusAction === "management"}
                                        onChange={() => setStatusAction("management")}
                                        className="h-4 w-4 text-primary"
                                    />
                                    Set all as Manager
                                </label>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTransferModalOpen(false)} disabled={isTransferring}>
                            Cancel
                        </Button>
                        <Button onClick={handleTransfer} disabled={isTransferring}>
                            {isTransferring ? "Transferring..." : "Confirm Transfer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Include Members Dialog */}
            <Dialog open={isIncludeModalOpen} onOpenChange={setIsIncludeModalOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Include Members</DialogTitle>
                        <DialogDescription>
                            Assign unassigned profiles to this department.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex flex-col gap-4 py-4 flex-1 overflow-hidden">
                        
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={selectAllInclude}>
                                    <CheckSquare className="w-4 h-4 mr-2" />
                                    Select All
                                </Button>
                                <Button variant="outline" size="sm" onClick={unselectAllInclude}>
                                    <Square className="w-4 h-4 mr-2" />
                                    Unselect All
                                </Button>
                                {includeSelectedIds.size > 0 && (
                                    <span className="text-sm text-muted-foreground ml-2">
                                        {includeSelectedIds.size} selected
                                    </span>
                                )}
                            </div>

                            <div className="relative w-full sm:w-72">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Search unassigned profiles..."
                                    className="pl-8 bg-card"
                                    value={includeSearchQuery}
                                    onChange={(e) => setIncludeSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Unassigned Profiles Table */}
                        <div className="rounded-md border bg-card overflow-y-auto flex-1 min-h-[300px]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-[inset_0_-1px_0_var(--border)]">
                                    <tr>
                                        <th className="px-4 py-3 font-medium w-12 text-center"></th>
                                        <th className="px-4 py-3 font-medium">Name</th>
                                        <th className="px-4 py-3 font-medium">Email</th>
                                        <th className="px-4 py-3 font-medium">Job Title</th>
                                        <th className="px-4 py-3 font-medium">Capabilities</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredUnassigned.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                                No unassigned profiles found matching your search.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUnassigned.map((profile) => {
                                            const isChecked = includeSelectedIds.has(profile.id)
                                            return (
                                                <tr key={profile.id} className="hover:bg-muted/50 transition-colors">
                                                    <td className="px-4 py-3 text-center align-middle">
                                                        <Checkbox 
                                                            checked={isChecked}
                                                            onCheckedChange={() => toggleIncludeSelection(profile.id)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium">{profile.given_name} {profile.last_name}</td>
                                                    <td className="px-4 py-3">{profile.email}</td>
                                                    <td className="px-4 py-3">{profile.job_title || "N/A"}</td>
                                                    <td className="px-4 py-3 max-w-[200px]">{renderCapabilities(profile)}</td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col gap-3 mt-4">
                            <Label>Assign As</Label>
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        id="assign-assessment" 
                                        checked={assignAsAssessment} 
                                        onCheckedChange={(c) => setAssignAsAssessment(c as boolean)} 
                                    />
                                    <Label htmlFor="assign-assessment" className="font-normal cursor-pointer">
                                        Employee (Assessment)
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox 
                                        id="assign-management" 
                                        checked={assignAsManagement} 
                                        onCheckedChange={(c) => setAssignAsManagement(c as boolean)} 
                                    />
                                    <Label htmlFor="assign-management" className="font-normal cursor-pointer">
                                        Manager
                                    </Label>
                                </div>
                            </div>
                        </div>

                    </div>

                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setIsIncludeModalOpen(false)} disabled={isIncluding}>
                            Cancel
                        </Button>
                        <Button onClick={handleInclude} disabled={isIncluding || includeSelectedIds.size === 0}>
                            {isIncluding ? "Assigning..." : "Assign Profiles"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Make manager / Remove as manager / Remove from department */}
            <Dialog open={memberAction !== null} onOpenChange={(open) => { if (!open) setMemberAction(null) }}>
                <DialogContent>
                    {memberAction && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {memberAction.kind === "promote" && `Make ${listNames(memberAction.profileIds)} a manager?`}
                                    {memberAction.kind === "demote" && `Remove ${listNames(memberAction.profileIds)} as manager?`}
                                    {memberAction.kind === "remove" && `Remove ${listNames(memberAction.profileIds)} from ${departmentInfo.name}?`}
                                </DialogTitle>
                                <DialogDescription>
                                    {memberAction.kind === "promote" && "They move to Management Profiles and stop receiving this department's scheduled assessments. They'll get the Manager role if they don't have it."}
                                    {memberAction.kind === "demote" && "They move back to Assessment Profiles and will receive this department's scheduled assessments. They keep the Manager role."}
                                    {memberAction.kind === "remove" && "They leave both lists. Their capability assignments and past results stay."}
                                </DialogDescription>
                            </DialogHeader>

                            {memberAction.kind === "demote" && replacementOptions.length > 1 && (
                                <div className="flex flex-col gap-2">
                                    <Label>Replace with (optional)</Label>
                                    <Select value={replacementId} onValueChange={(value) => setReplacementId(value ?? "")} items={replacementOptions}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="No replacement" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {replacementOptions.map((option) => (
                                                <SelectItem key={option.value || "none"} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {memberActionPreview?.ok && memberActionPreview.plan.leavesNoManager && (
                                <div className="bg-destructive/15 text-destructive border border-destructive/20 rounded-md p-3 flex items-start gap-2 text-sm">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <p>This leaves the department with employees but no manager, so nobody can assign them assessments.</p>
                                </div>
                            )}

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setMemberAction(null)} disabled={isApplyingMemberAction}>
                                    Cancel
                                </Button>
                                <Button
                                    variant={memberAction.kind === "remove" ? "destructive" : "default"}
                                    onClick={handleMemberAction}
                                    disabled={isApplyingMemberAction}
                                >
                                    {isApplyingMemberAction ? "Saving..." : {
                                        promote: "Make manager",
                                        demote: replacementId ? "Replace manager" : "Remove as manager",
                                        remove: "Remove",
                                    }[memberAction.kind]}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
