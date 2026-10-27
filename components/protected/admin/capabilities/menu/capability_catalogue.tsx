"use client"

import { useState } from "react";
import { CapabilityCard } from "./capability_catalogue_card";
import { Input } from "@/components/ui/input";
import { Search, Library, Activity, AlertCircle, Filter, ArrowUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// define muna yung values na bitbit ng capability
interface Capability {
    id: string;
    name: string;
    description: string;
    owner_id: string;
    status: string;
    current_preset?: string | null;
    updated_at?: string;
    created_at?: string;
    presetStatus?: string | null;
    questionsCount?: number;
    presetsCount?: number;
    employeesCount?: number;
    presetName?: string;
    presetQuestionsCount?: number;
}

// tumatanggap ng capability object (see main page ng capabilities section sa admin side)
export function CapabilityCatalogue({ capabilities, canEdit = true }: { capabilities: Capability[], canEdit?: boolean }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [presetFilter, setPresetFilter] = useState("all");
    const [sortOption, setSortOption] = useState("newest");

    // Compute insights
    const totalCount = capabilities.length;
    const activeCount = capabilities.filter(cap => (cap.status || "active").toLowerCase() === "active").length;
    const noPresetCount = capabilities.filter(cap => !cap.current_preset).length;

    const filteredCapabilities = capabilities.filter(cap => {
        const matchesSearch = cap.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (cap.description && cap.description.toLowerCase().includes(searchQuery.toLowerCase()));
            
        const isActive = (cap.status || "active").toLowerCase() === "active";
        const matchesStatus = statusFilter === "all" || 
            (statusFilter === "active" && isActive) ||
            (statusFilter === "archived" && !isActive);
            
        const hasPreset = !!cap.current_preset;
        const matchesPreset = presetFilter === "all" ||
            (presetFilter === "has_preset" && hasPreset) ||
            (presetFilter === "no_preset" && !hasPreset);
            
        return matchesSearch && matchesStatus && matchesPreset;
    });

    const sortedCapabilities = [...filteredCapabilities].sort((a, b) => {
        if (sortOption === "name_asc") {
            return a.name.localeCompare(b.name);
        } else if (sortOption === "name_desc") {
            return b.name.localeCompare(a.name);
        } else if (sortOption === "oldest") {
            const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
            const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
            return timeA - timeB;
        } else {
            // newest (default)
            const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
            const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
            return timeB - timeA;
        }
    });

    const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "all" || presetFilter !== "all" || sortOption !== "newest";

    return (
        <div className="space-y-6 mt-4">
            {/* Quick Insights Strip */}
            {/* Future Reference: Can render insight boxes matching the assessment catalogue style:
                border-2 border-card-foreground/40 rounded-md bg-card text-card-foreground */}
            {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                            <Library className="h-3 w-3 mr-1" />
                            Total Capabilities
                        </div>
                        <div className="text-xl font-medium mt-2">{totalCount}</div>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                            <Activity className="h-3 w-3 mr-1" />
                            Active
                        </div>
                        <div className="text-xl font-medium mt-2">{activeCount}</div>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 rounded-md bg-card border-2 border-card-foreground/40 text-card-foreground">
                    <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-tight flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Needs Preset
                        </div>
                        <div className="text-xl font-medium mt-2">{noPresetCount}</div>
                    </div>
                </div>
            </div> */}

            {/* Search and Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                    {/* Search Input with Clear Button */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            type="search"
                            placeholder="Search capabilities by name or description..."
                            className="pl-9 pr-8 h-10 w-full border-2"
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
                    
                    {/* Filter and Sort Triggers */}
                    <div className="flex items-center gap-2">
                        {/* Status & Preset Filter Dropdown (Hidden for now as requested in assessment section redesign; archived selection removed) */}
                        {/* Future Guide: Can be re-enabled to allow filtering by status or preset. Archived selection removed. */}
                        {/* <DropdownMenu>
                            <DropdownMenuTrigger render={
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "h-10 gap-2 transition-colors",
                                        (statusFilter !== "all" || presetFilter !== "all") &&
                                            "bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                                    )}
                                >
                                    <Filter
                                        className={cn(
                                            "h-4 w-4",
                                            statusFilter !== "all" || presetFilter !== "all" ? "text-white" : "text-muted-foreground"
                                        )}
                                    />
                                    {(statusFilter !== "all" || presetFilter !== "all") && (
                                        <span className="text-xs font-medium">
                                            {statusFilter !== "all"
                                                ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)
                                                : presetFilter === "has_preset"
                                                ? "Has Preset"
                                                : "No Preset"}
                                        </span>
                                    )}
                                </Button>
                            } />
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuRadioGroup value={statusFilter} onValueChange={(val) => val && setStatusFilter(val)}>
                                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuRadioItem value="all">All Status</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>

                                <DropdownMenuSeparator />

                                <DropdownMenuRadioGroup value={presetFilter} onValueChange={(val) => val && setPresetFilter(val)}>
                                    <DropdownMenuLabel>Filter by Preset</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuRadioItem value="all">All Presets</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="has_preset">Has Preset</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="no_preset">No Preset</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu> */}

                        {/* Sort Dropdown */}
                        {/* Future Guide: Label removed leaving icon. When a sort other than 'newest' (Recently Updated) is selected,
                            button turns blue and icon turns white to indicate an active sorting state. */}
                        <DropdownMenu>
                            <DropdownMenuTrigger render={
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        "h-10 w-10 border-2 transition-colors",
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
                            } />
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuRadioGroup value={sortOption} onValueChange={(val) => val && setSortOption(val)}>
                                    <DropdownMenuLabel>Sort Capabilities</DropdownMenuLabel>
                                    <DropdownMenuRadioItem value="newest">Recently Updated</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="oldest">Oldest First</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="name_asc">Alphabetical (A-Z)</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="name_desc">Alphabetical (Z-A)</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Active Filter Pill */}
                {hasActiveFilters && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                            Showing {sortedCapabilities.length} of {capabilities.length} capabilities
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setSearchQuery("");
                                setStatusFilter("all");
                                setPresetFilter("all");
                                setSortOption("newest");
                            }}
                            className="h-6 px-2 text-xs text-primary"
                        >
                            Reset filters
                        </Button>
                    </div>
                )}

                {/* Catalogue Cards Grid */}
                {sortedCapabilities.length === 0 ? (
                    <div className="min-h-[240px] flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-muted/10">
                        <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground">
                            <Library className="h-6 w-6" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">
                            {capabilities.length === 0 
                                ? "No capabilities found" 
                                : "No capabilities match your filters"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            {capabilities.length === 0
                                ? "There are currently no capabilities in the database."
                                : "Try adjusting your search query or sorting option to see other capabilities."}
                        </p>
                        {hasActiveFilters && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => {
                                    setSearchQuery("");
                                    setStatusFilter("all");
                                    setPresetFilter("all");
                                    setSortOption("newest");
                                }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sortedCapabilities.map((capability) => (
                            <CapabilityCard key={capability.id} capabilities={capability} canEdit={canEdit} />
                        ))}
                    </div>
                )}
        </div>
    )
}
