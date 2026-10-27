"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Building2, CheckCircle2, XCircle, TrendingUp, TrendingDown } from "lucide-react"
import { Department } from "./department_catalogues"

// Distinct colors for the pie chart slices
const COLORS = [
    "#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8",
    "#82CA9D", "#A4DE6C", "#D0ED57", "#FFA07A", "#20B2AA"
]

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without this, the closed
// trigger shows e.g. "managers" instead of "Managers Only".
const POPULATION_FILTER_OPTIONS = [
    { value: "all", label: "All Members" },
    { value: "managers", label: "Managers Only" },
    { value: "employees", label: "Employees Only" },
]

export function DepartmentStats({ departments }: { departments: Department[] }) {
    const [populationFilter, setPopulationFilter] = useState<"all" | "managers" | "employees">("all")

    const stats = useMemo(() => {
        const total = departments.length
        const active = departments.filter(d => d.status === 'active').length
        const closed = departments.filter(d => d.status === 'closed').length
        return { total, active, closed }
    }, [departments])

    const extremes = useMemo(() => {
        const activeDepts = departments.filter(d => d.status === 'active')
        if (activeDepts.length === 0) return { largest: null, smallest: null }
        
        const sorted = [...activeDepts].sort((a, b) => a.totalMembers - b.totalMembers)
        return {
            smallest: sorted[0],
            largest: sorted[sorted.length - 1]
        }
    }, [departments])

    const chartData = useMemo(() => {
        return departments.map(dept => {
            let value = 0;
            if (populationFilter === "all") {
                value = dept.totalMembers
            } else if (populationFilter === "managers") {
                value = dept.managersCount
            } else if (populationFilter === "employees") {
                value = dept.totalMembers - dept.managersCount
            }
            return {
                name: dept.name,
                value
            }
        }).filter(item => item.value > 0) // Only show departments that have members in this category
    }, [departments, populationFilter])

    return (
        <div className="flex flex-col gap-6 my-6">
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Departments</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Departments</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.active}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Closed Departments</CardTitle>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.closed}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Extremes Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Largest Active Department</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold truncate">
                            {extremes.largest ? extremes.largest.name : "N/A"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {extremes.largest ? `${extremes.largest.totalMembers} members` : ""}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Smallest Active Department</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold truncate">
                            {extremes.smallest ? extremes.smallest.name : "N/A"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {extremes.smallest ? `${extremes.smallest.totalMembers} members` : ""}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Population Chart */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Department Population</CardTitle>
                    <Select value={populationFilter} onValueChange={(val) => setPopulationFilter(val as "all" | "managers" | "employees")} items={POPULATION_FILTER_OPTIONS}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filter population" />
                        </SelectTrigger>
                        <SelectContent>
                            {POPULATION_FILTER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    {chartData.length === 0 ? (
                        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                            No members found for this filter.
                        </div>
                    ) : (
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                        outerRadius={110}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        formatter={(value) => [value, 'Members']}
                                    />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
