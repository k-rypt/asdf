"use client"

import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  HoverCard, 
  HoverCardTrigger, 
  HoverCardContent 
} from "@/components/ui/hover-card";
import { usePathname, useRouter } from "next/navigation";
import { 
  Question, 
  SlidersHorizontal, 
  DotsThreeVertical, 
  Check, 
  CheckCircle, 
  Clock, 
  XCircle, 
  FileText,
  Warning 
} from "@phosphor-icons/react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { changedRows } from "@/lib/admin/changed-rows";
import { toast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";

const STATUS_OPTIONS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
];

export interface CapabilityData {
    id: string;
    name: string;
    description: string;
    status?: string;
    updated_at?: string;
    created_at?: string;
    questionsCount?: number;
    presetsCount?: number;
    employeesCount?: number;
    presetName?: string;
    presetQuestionsCount?: number;
    presetStatus?: string | null;
}

export function CapabilityCard({ capabilities, canEdit = true }: { capabilities: CapabilityData, canEdit?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isUpdating, setIsUpdating] = useState(false);
    const detailsHref = `${pathname}/${capabilities.id}`;

    // Fallbacks for UI testing
    const status = capabilities.status || "active";
    const isActive = status.toLowerCase() === "active";
    
    // UI Values (Using provided data or 0/null as fallback)
    const questionsCount = capabilities.questionsCount ?? 0;
    const presetsCount = capabilities.presetsCount ?? 0;
    const presetName = capabilities.presetName;
    const presetQuestionsCount = capabilities.presetQuestionsCount ?? 0;
    const presetStatus = capabilities.presetStatus;
    const isApproved = presetStatus === "approved";
    
    const dateToFormat = capabilities.updated_at || capabilities.created_at;
    const formattedDate = formatDate(dateToFormat);

    async function handleSetStatus(newStatus: string) {
        if (newStatus === status.toLowerCase()) return;
        setIsUpdating(true);
        try {
            const supabase = createClient();
            changedRows(
                await supabase
                    .from("capabilities")
                    .update({ status: newStatus })
                    .eq("id", capabilities.id)
                    .select("id")
            );
            toast.add({
                title: "Status Updated",
                description: `${capabilities.name} marked as ${newStatus}.`,
                type: "success",
            });
            router.refresh();
        } catch (error) {
            toast.add({
                title: "Update Failed",
                description: error instanceof Error ? error.message : String(error),
                type: "error",
            });
        } finally {
            setIsUpdating(false);
        }
    }

    return(
        <Card 
            className="group relative cursor-pointer transition-all flex flex-col h-full border py-0 gap-0 bg-card rounded-none"
            onClick={() => { 
                router.push(detailsHref)
            }}
        >  
            {/* Header, Title, & Description */}
            <CardHeader className="flex flex-row items-start justify-between p-6 pb-4">
                <div className="space-y-1 min-w-0 pr-3">
                    <CardTitle className="text-lg leading-none truncate" title={capabilities.name}>
                        {capabilities.name}
                    </CardTitle>
                    {/* Footer */}
                    <div className="text-xs text-muted-foreground">
                        Last Updated: {formattedDate}
                    </div>
                </div>

                {/* Top Right Corner: Stacked Indicators (Questions top, Presets bottom) + Menu */}
                <div className="flex items-center gap-3 ml-auto shrink-0">
                    <div className="flex flex-col items-end gap-1.5">
                        {/* Questions Count (Top) */}
                        <HoverCard>
                            <HoverCardTrigger 
                                delay={120} 
                                closeDelay={150}
                                render={
                                    <div 
                                        className="flex items-center gap-1.5 text-xs font-medium tracking-tight text-foreground cursor-default"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Question weight="fill" className="h-3.5 w-3.5 text-foreground" />
                                        <span className="font-mono">{questionsCount}</span>
                                    </div>
                                } 
                            />
                            <HoverCardContent side="left" align="start" className="w-56 p-3 text-xs">
                                <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                                    <Question weight="fill" className="h-3.5 w-3.5 text-primary" />
                                    Question Pool
                                </div>
                                <div className="text-muted-foreground text-[11px] leading-relaxed">
                                    {questionsCount} {questionsCount === 1 ? "question" : "questions"} created for this capability.
                                </div>
                            </HoverCardContent>
                        </HoverCard>

                        {/* Presets Count (Bottom) */}
                        <HoverCard>
                            <HoverCardTrigger 
                                delay={120} 
                                closeDelay={150}
                                render={
                                    <div 
                                        className="flex items-center gap-1.5 text-xs font-medium tracking-tight text-foreground cursor-default"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <SlidersHorizontal weight="fill" className="h-3.5 w-3.5 text-foreground" />
                                        <span className="font-mono">{presetsCount}</span>
                                    </div>
                                } 
                            />
                            <HoverCardContent side="left" align="start" className="w-56 p-3 text-xs">
                                <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                                    <SlidersHorizontal weight="fill" className="h-3.5 w-3.5 text-primary" />
                                    Assessment Presets
                                </div>
                                <div className="text-muted-foreground text-[11px] leading-relaxed">
                                    {presetsCount} {presetsCount === 1 ? "preset" : "presets"} configured for this capability.
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    </div>

                    {canEdit && (
                        <div onClick={(e) => e.stopPropagation()} className="-mr-2 self-start">
                            <DropdownMenu>
                                <DropdownMenuTrigger render={
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                        <DotsThreeVertical weight="bold" className="h-4 w-4" />
                                    </Button>
                                } />
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(detailsHref)}>
                                    View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuSub>
                                        <DropdownMenuSubTrigger className="cursor-pointer" disabled={isUpdating}>
                                        Set Status
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                            {STATUS_OPTIONS.map((option) => (
                                                <DropdownMenuItem
                                                    key={option.value}
                                                    className="cursor-pointer"
                                                    onClick={() => handleSetStatus(option.value)}
                                                >
                                                    {option.label}
                                                    {status.toLowerCase() === option.value && <Check weight="bold" className="ml-auto h-4 w-4" />}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                </div>
            </CardHeader>

            {/* Separator - inset from the outer card borders */}
            <div className="px-6">
                <Separator className="h-0.5" />
            </div>

            <CardFooter className="flex flex-col flex-1 bg-card p-6 pt-3">
                {/*  Preset Box */}
                <div className="w-full">
                    <div className="text-xs text-muted-foreground mb-1.5">
                        <span>Active Preset</span>
                    </div>

                    {presetName ? (
                        <div 
                            className={cn(
                                "rounded-none border p-3 min-w-0 transition-colors font-mono",
                                isApproved 
                                    ? "border-blue-500/30 bg-blue-950/30 text-blue-200" 
                                    : presetStatus === "pending_approval"
                                    ? "border-amber-500/30 bg-amber-950/30 text-amber-200"
                                    : presetStatus === "rejected"
                                    ? "border-destructive/30 bg-destructive/10 text-red-200"
                                    : "border-border bg-secondary/40 text-secondary-foreground"
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div 
                                    className={cn(
                                        "text-xs font-semibold tracking-tight truncate",
                                        isApproved
                                            ? "text-blue-100"
                                            : presetStatus === "pending_approval"
                                            ? "text-amber-200"
                                            : "text-foreground"
                                    )} 
                                    title={presetName}
                                >
                                    {presetName}
                                </div>
                                {isApproved ? (
                                    <Badge 
                                        className="rounded-none bg-blue-500/20 text-blue-200 border border-blue-500/30 gap-1 text-[10px] font-semibold py-0 h-4 px-1.5 shrink-0 shadow-none"
                                    >
                                        <CheckCircle weight="fill" className="h-2.5 w-2.5 text-blue-300" />
                                        Approved
                                    </Badge>
                                ) : presetStatus === "pending_approval" ? (
                                    <Badge 
                                        variant="outline" 
                                        className="rounded-none bg-amber-500/20 text-amber-200 border border-amber-500/30 gap-1 text-[10px] font-medium py-0 h-4 px-1.5 shrink-0 shadow-none"
                                    >
                                        <Clock weight="fill" className="h-2.5 w-2.5 text-amber-300" />
                                        Pending
                                    </Badge>
                                ) : presetStatus === "rejected" ? (
                                    <Badge 
                                        variant="destructive" 
                                        className="rounded-none bg-destructive/20 text-destructive border border-destructive/30 gap-1 text-[10px] font-medium py-0 h-4 px-1.5 shrink-0 shadow-none"
                                    >
                                        <XCircle weight="fill" className="h-2.5 w-2.5 text-destructive" />
                                        Rejected
                                    </Badge>
                                ) : (
                                    <Badge 
                                        variant="outline" 
                                        className="rounded-none bg-background text-foreground border border-border gap-1 text-[10px] font-medium py-0 h-4 px-1.5 shrink-0 shadow-none"
                                    >
                                        <FileText weight="fill" className="h-2.5 w-2.5 text-foreground" />
                                        Draft
                                    </Badge>
                                )}
                            </div>

                            <HoverCard>
                                <HoverCardTrigger 
                                    delay={120} 
                                    closeDelay={150}
                                    render={
                                        <div 
                                            className={cn(
                                                "text-xs mt-1.5 tracking-tight flex items-center gap-1 w-fit cursor-default",
                                                isApproved
                                                    ? "text-blue-300/80"
                                                    : presetStatus === "pending_approval"
                                                    ? "text-amber-300/80"
                                                    : "text-muted-foreground"
                                            )}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                             <Question weight="fill" className="w-3 h-3" />
                                             <span>{presetQuestionsCount}</span>
                                        </div>
                                    } 
                                />
                                <HoverCardContent side="top" align="start" className="w-52 p-2.5 text-xs font-sans">
                                    <div className="text-muted-foreground text-[11px] leading-relaxed">
                                        <span className="font-semibold text-foreground">{presetQuestionsCount}</span> {presetQuestionsCount === 1 ? "question" : "questions"} selected in this preset.
                                    </div>
                                </HoverCardContent>
                            </HoverCard>
                        </div>
                    ) : (
                        <div className="rounded-none border border-destructive/30 bg-destructive/10 p-3 min-w-0 flex flex-col justify-between gap-1.5 transition-colors font-mono">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-red-200">
                                    <Warning weight="fill" className="h-3.5 w-3.5 shrink-0 text-destructive" />
                                    <span>No active preset</span>
                                </div>
                                <Badge 
                                    className="rounded-none bg-destructive/20 text-destructive border border-destructive/30 gap-1 text-[10px] font-semibold py-0 h-4 px-1.5 shrink-0 shadow-none"
                                >
                                    Warning
                                </Badge>
                            </div>
                            <div className="text-[11px] text-red-300/70">
                                Ineligible for assessments
                            </div>
                        </div>
                    )}
                </div>
            </CardFooter>
        </Card>
    )
}
