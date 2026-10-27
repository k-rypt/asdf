"use client"

import { useMemo } from "react"
import type { CapabilityLink, DepartmentMember } from "./department-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export function DepartmentCapabilitiesChart({ departmentMembers }: { departmentMembers: DepartmentMember[] }) {
    const chartData = useMemo(() => {
        const capabilityCounts: Record<string, number> = {}

        departmentMembers.forEach(member => {
            const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile
            if (profile && profile.profile_capabilities) {
                profile.profile_capabilities.forEach((pc: CapabilityLink) => {
                    const cap = Array.isArray(pc.capabilities) ? pc.capabilities[0] : pc.capabilities
                    if (cap && cap.name) {
                        capabilityCounts[cap.name] = (capabilityCounts[cap.name] || 0) + 1
                    }
                })
            }
        })

        const data = Object.keys(capabilityCounts).map(name => ({
            name,
            members: capabilityCounts[name]
        }))

        // Sort by highest count
        data.sort((a, b) => b.members - a.members)

        return data
    }, [departmentMembers])

    if (chartData.length === 0) return null // Hide chart if no capabilities are found

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>Department Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip 
                                formatter={(value) => [value, 'Members']}
                                cursor={{fill: 'transparent'}}
                            />
                            <Bar dataKey="members" fill="#8884d8" radius={[4, 4, 0, 0]} maxBarSize={60} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
