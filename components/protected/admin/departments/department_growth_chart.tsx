"use client"

import { useMemo } from "react"
import type { DepartmentMember } from "./department-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { formatDate } from "@/lib/utils"

export function DepartmentGrowthChart({ departmentMembers }: { departmentMembers: DepartmentMember[] }) {
    const chartData = useMemo(() => {
        if (!departmentMembers || departmentMembers.length === 0) return []

        // 1. Sort members by added_at date, and ensure unique profiles
        const uniqueProfiles = new Set<string>()
        const sortedMembers = [...departmentMembers]
            .filter((m): m is DepartmentMember & { added_at: string } => Boolean(m.added_at))
            .sort((a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime())
            .filter(m => {
                if (uniqueProfiles.has(m.profile_id)) return false
                uniqueProfiles.add(m.profile_id)
                return true
            })

        // 2. Group by Date (YYYY-MM-DD) and keep a running total
        const timelineData: Record<string, number> = {}
        let runningTotal = 0

        sortedMembers.forEach(member => {
            const dateObj = new Date(member.added_at)
            // Format as YYYY-MM-DD
            const dateKey = dateObj.toISOString().split('T')[0]
            runningTotal += 1
            timelineData[dateKey] = runningTotal
        })

        // 3. Convert to array for Recharts
        return Object.keys(timelineData).map(dateKey => ({
            date: dateKey,
            displayDate: formatDate(dateKey),
            totalMembers: timelineData[dateKey]
        }))
    }, [departmentMembers])

    if (chartData.length === 0) return null

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Growth Timeline</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                        >
                            <defs>
                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis 
                                dataKey="displayDate" 
                                tick={{ fontSize: 12 }} 
                                tickMargin={10} 
                            />
                            <YAxis allowDecimals={false} />
                            <Tooltip 
                                labelFormatter={(label) => `Date: ${label}`}
                                formatter={(value) => [value, 'Total Members']}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="totalMembers" 
                                stroke="#10b981" 
                                fillOpacity={1} 
                                fill="url(#colorTotal)" 
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    )
}
