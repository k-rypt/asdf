import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { DepartmentMembersClient } from "@/components/protected/admin/departments/department_members_client"
import type { DepartmentMember, DepartmentProfile } from "@/components/protected/admin/departments/department-types"

interface PageProps {
  params: Promise<{ department: string }>
  searchParams: Promise<{ action?: string | string[] }>
}

export default async function DepartmentPage({ params, searchParams }: PageProps) {
    const { department: departmentId } = await params
    // The catalogue card's menu links here with ?action=edit|close to open that dialog.
    const { action } = await searchParams
    const initialAction = action === "edit" || action === "close" ? action : undefined
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Fetch the specific department info for the header
    const { data: departmentInfo, error: deptInfoError } = await supabase
        .from('departments')
        .select(`
            name,
            description,
            created_at,
            last_updated,
            status,
            creator:profiles!departments_created_by_fkey (
                given_name,
                last_name
            ),
            updater:profiles!departments_updated_by_fkey (
                given_name,
                last_name
            )
        `)
        .eq('id', departmentId)
        .single()

    if (deptInfoError) {
        console.error("Error fetching department info:", deptInfoError)
    }

    // Fetch the department members and join their profiles + capabilities + the adder's profile
    const { data: departmentMembers, error: membersError } = await supabase
        .from('profile_departments')
        .select(`
            profile_id,
            status,
            added_at,
            profile:profiles!profile_departments_profile_id_fkey (
                id,
                given_name,
                last_name,
                email,
                job_title,
                profile_capabilities (
                    capabilities (
                        name
                    )
                )
            ),
            adder:profiles!profile_departments_added_by_fkey (
                given_name,
                last_name
            )
        `)
        .eq('department_id', departmentId)

    if (membersError) {
        console.error("Error fetching department members:", membersError)
    }

    // Fetch all departments for the Transfer feature
    const { data: allDepartments, error: deptsError } = await supabase
        .from('departments')
        .select('id, name, status')
        .order('name')

    if (deptsError) {
        console.error("Error fetching departments:", deptsError)
    }

    // Fetch all profiles to find those NOT in any department
    const { data: allProfiles, error: allProfilesError } = await supabase
        .from('profiles')
        .select(`
            id,
            given_name,
            last_name,
            email,
            job_title,
            profile_capabilities (
                capabilities (
                    name
                )
            ),
            profile_departments!profile_departments_profile_id_fkey (
                department_id
            )
        `)
        
    if (allProfilesError) {
        console.error("Error fetching all profiles:", allProfilesError)
    }

    // Filter profiles that have no profile_departments records
    const unassignedProfiles = allProfiles?.filter(p => !p.profile_departments || p.profile_departments.length === 0) || []

    const creator = Array.isArray(departmentInfo?.creator) ? departmentInfo?.creator[0] : departmentInfo?.creator
    const creatorName = creator ? `${creator.given_name} ${creator.last_name}` : "Unknown"

    const updater = Array.isArray(departmentInfo?.updater) ? departmentInfo?.updater[0] : departmentInfo?.updater
    const updaterName = updater ? `${updater.given_name} ${updater.last_name}` : "Unknown"

    const deptInfo = {
        id: departmentId,
        name: departmentInfo?.name || "Department Details",
        description: departmentInfo?.description || "",
        created_at: departmentInfo?.created_at || null,
        creatorName: creatorName,
        last_updated: departmentInfo?.last_updated || null,
        updaterName: updaterName,
        status: (departmentInfo?.status as 'active' | 'closed') || 'active'
    }

    return (
        <main className="flex justify-center min-h-svh w-full">
            <div className="w-full max-w-6xl p-5 flex flex-col gap-6">
                {/* Render the Client Component which handles selection state and the header */}
                <DepartmentMembersClient 
                    departmentMembers={(departmentMembers ?? []) as unknown as DepartmentMember[]} 
                    allDepartments={allDepartments || []}
                    currentDepartmentId={departmentId}
                    unassignedProfiles={unassignedProfiles as unknown as DepartmentProfile[]}
                    departmentInfo={deptInfo}
                    initialAction={initialAction}
                />
            </div>
        </main>
    )
}