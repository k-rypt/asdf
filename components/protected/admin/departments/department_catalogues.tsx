"use client"

import { useState, useMemo } from "react"
import { DepartmentCatalogueCard } from "./department_catalogue_card"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without these, the closed
// trigger shows e.g. "alphabetical" instead of "Alphabetical (A-Z)".
const STATUS_FILTER_OPTIONS = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "closed", label: "Closed" },
]

const SORT_OPTIONS = [
    { value: "alphabetical", label: "Alphabetical (A-Z)" },
    { value: "recent", label: "Recently Added" },
    { value: "oldest", label: "Oldest Added" },
    { value: "members", label: "Most Members" },
]

export interface Department {
    id: string,
    name: string,
    created_at: string,
    created_by: string,
    last_updated: string | null,
    updated_by: string | null,
    totalMembers: number,
    managersCount: number,
    creatorName?: string,
    updaterName?: string,
    capabilityCounts?: Record<string, number>,
    status: 'active' | 'closed'
}

export function DepartmentsCatalogue(
    { departments }: { departments: Department[] }
) {
    const [searchQuery, setSearchQuery] = useState("")
    const [sortOption, setSortOption] = useState("alphabetical")
    const [statusFilter, setStatusFilter] = useState("all")

    const filteredAndSorted = useMemo(() => {
        let result = [...departments]

        // 1. Filter by Status
        if (statusFilter !== "all") {
            result = result.filter(dept => dept.status === statusFilter)
        }

        // 2. Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim()
            result = result.filter(dept => dept.name.toLowerCase().includes(query))
        }

        // 3. Sort
        result.sort((a, b) => {
            switch (sortOption) {
                case "alphabetical":
                    return a.name.localeCompare(b.name)
                case "recent":
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                case "oldest":
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                case "members":
                    return b.totalMembers - a.totalMembers
                default:
                    return 0
            }
        })

        return result
    }, [departments, searchQuery, sortOption, statusFilter])

    return (
        <div className="flex flex-col gap-6 mt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search departments..."
                        className="pl-8 bg-card"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Label className="text-muted-foreground whitespace-nowrap text-sm">Status:</Label>
                        <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value)} items={STATUS_FILTER_OPTIONS}>
                            <SelectTrigger className="w-full sm:w-[120px]">
                                <SelectValue placeholder="Status..." />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_FILTER_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Label className="text-muted-foreground whitespace-nowrap text-sm">Sort by:</Label>
                        <Select value={sortOption} onValueChange={(value) => value && setSortOption(value)} items={SORT_OPTIONS}>
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Sort..." />
                            </SelectTrigger>
                            <SelectContent>
                                {SORT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {filteredAndSorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <p>No departments found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAndSorted.map((department) => (
                        <DepartmentCatalogueCard key={department.id} department={department} />
                    ))}
                </div>
            )}
        </div>
    )
}
