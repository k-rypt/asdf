"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without this, the closed
// trigger shows lowercase "active"/"archived" instead of the labels below.
const STATUS_OPTIONS = [
    { value: "active", label: "Active" },
    { value: "archived", label: "Archived" },
]

interface CapabilityStatusSelectProps {
    capabilityId: string
    currentStatus: string
    disabled?: boolean
}

export function CapabilityStatusSelect({ capabilityId, currentStatus, disabled = false }: CapabilityStatusSelectProps) {
    const router = useRouter()
    const supabase = createClient()
    const [status, setStatus] = useState(currentStatus || 'active')
    const [isUpdating, setIsUpdating] = useState(false)

    const handleStatusChange = async (newStatus: string) => {
        setIsUpdating(true)
        try {
            const { error } = await supabase
                .from('capabilities')
                .update({ status: newStatus })
                .eq('id', capabilityId)

            if (error) throw error

            setStatus(newStatus)
            toast.add({
                title: "Status Updated",
                description: `Capability marked as ${newStatus}.`,
                type: "success"
            })
            router.refresh()
        } catch (error) {
            console.error("Failed to update status:", error)
            toast.add({
                title: "Update Failed",
                description: (error instanceof Error ? error.message : String(error)) || "An unexpected error occurred.",
                type: "error"
            })
            // revert locally if failed
            setStatus(currentStatus)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Status:</span>
            <Select
                value={status}
                onValueChange={(value) => value && handleStatusChange(value)}
                disabled={isUpdating || disabled}
                items={STATUS_OPTIONS}
            >
                <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
