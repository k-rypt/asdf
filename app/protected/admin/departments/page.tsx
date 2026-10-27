import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers"

import { NewDepartment } from "@/components/protected/admin/departments/new_deparment";
import { DepartmentsCatalogue } from "@/components/protected/admin/departments/department_catalogues";
import { DepartmentStats } from "@/components/protected/admin/departments/department_stats";

// A to-one embed comes back as an object or a one-element array depending
// on how PostgREST infers the relationship.
function profileName(embed: unknown): string {
    const profile = (Array.isArray(embed) ? embed[0] : embed) as
        | { given_name?: string | null; last_name?: string | null }
        | null
        | undefined
    return profile ? `${profile.given_name || ''} ${profile.last_name || ''}`.trim() : ''
}

async function getDepartments() {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // 1. Fetch departments along with their related profile_departments
    const { data: departments, error } = await supabase
        .from("departments")
        .select(`
            *,
            profile_departments (
                status
            ),
            creator:profiles!created_by (
                given_name,
                last_name
            ),
            updater:profiles!departments_updated_by_fkey (
                given_name,
                last_name
            )
        `)
        
    if (error) {
        console.error("Error fetching departments:", error)
        return []
    }

    // 2. Map through the results and calculate the exact counts in JavaScript
    const departmentsWithCounts = departments.map((dept) => {
        const totalMembers = dept.profile_departments.length
        const managersCount = dept.profile_departments.filter(
            (pd: { status: string }) => pd.status === 'management'
        ).length
        
        // Format creator name safely
        const creatorName = profileName(dept.creator) || dept.created_by;

        const updaterName = profileName(dept.updater) || dept.updated_by;

        // Remove the raw array from the final object for a cleaner payload
        const { profile_departments, creator, updater, ...departmentData } = dept
        
        return {
            ...departmentData,
            totalMembers,
            managersCount,
            creatorName,
            updaterName,
            status: dept.status
        }
    })

    return departmentsWithCounts
}

export default async function AdminDepartmentPage() {
    // server-side fetch
    const departments = await getDepartments()

    return (
      <main className="flex justify-center min-h-svh w-full">
         <div className="w-full max-w-6xl p-5 flex flex-col">
            <header className="flex justify-between">
                <h1>Departments</h1>
                {/* New Department Button here */}
                <NewDepartment />
            </header>
            <DepartmentStats departments={departments} />
            <div>
                <DepartmentsCatalogue departments={departments} />
            </div>
         </div>
      </main>
    )
}