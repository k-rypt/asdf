"use client"

import { useMemo } from "react"
import type { DepartmentMember } from "./department-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCog, User, Percent } from "lucide-react"

export function DepartmentRatioCards({ departmentMembers }: { departmentMembers: DepartmentMember[] }) {
    const stats = useMemo(() => {
        const uniqueMembers = new Set(departmentMembers.map(m => m.profile_id)).size
        const managers = departmentMembers.filter(m => m.status === 'management').length
        const employees = departmentMembers.filter(m => m.status === 'assessment').length
        
        let ratioText = "N/A"
        if (uniqueMembers === 0) {
            ratioText = "No members"
        } else if (managers === 0) {
            ratioText = "0 Managers (Warning)"
        } else if (employees === 0) {
            ratioText = "All Managers"
        } else {
            // Simplify ratio if possible, e.g., 2:8 -> 1:4
            const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
            const divisor = gcd(managers, employees)
            ratioText = `${managers / divisor} : ${employees / divisor}`
        }

        return { total: uniqueMembers, managers, employees, ratioText }
    }, [departmentMembers])

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Managers</CardTitle>
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.managers}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Employees</CardTitle>
                    <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.employees}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Mgr-to-Emp Ratio</CardTitle>
                    <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.ratioText}</div>
                </CardContent>
            </Card>
        </div>
    )
}
