"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { PencilIcon, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { changedRows } from "@/lib/admin/changed-rows"

interface CapabilityDescriptionEditorProps {
    capabilityId: string
    initialDescription: string | null
}

export function CapabilityDescriptionEditor({ capabilityId, initialDescription }: CapabilityDescriptionEditorProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [description, setDescription] = useState(initialDescription || "")
    const [isSaving, setIsSaving] = useState(false)
    const supabase = createClient()
    const router = useRouter()

    const handleSave = async () => {
        setIsSaving(true)
        try {
            changedRows(
                await supabase.from('capabilities').update({ description }).eq('id', capabilityId).select('id')
            )

            toast.add({
                title: "Description Updated",
                description: "The capability description has been successfully updated.",
                type: "success"
            })
            setIsEditing(false)
            router.refresh()
        } catch (error) {
            console.error("Failed to update description:", error)
            toast.add({
                title: "Update Failed",
                description: (error instanceof Error ? error.message : String(error)) || "An unexpected error occurred.",
                type: "error"
            })
        } finally {
            setIsSaving(false)
        }
    }

    if (isEditing) {
        return (
            <div className="mt-2 space-y-2 max-w-2xl">
                <Textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter capability description..."
                    className="min-h-[100px] text-lg resize-none"
                    disabled={isSaving}
                />
                <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                        <Check className="h-4 w-4 mr-2" />
                        Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                        setDescription(initialDescription || "")
                        setIsEditing(false)
                    }} disabled={isSaving}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="group flex items-start gap-2 mt-2">
            <p className="text-muted-foreground text-lg">
                {description || "No description provided."}
            </p>
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity -mt-1"
                onClick={() => setIsEditing(true)}
            >
                <PencilIcon className="h-3 w-3" />
                <span className="sr-only">Edit description</span>
            </Button>
        </div>
    )
}
