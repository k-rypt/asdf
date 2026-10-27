"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { Plus, Info, Loader2 } from "lucide-react"

export function NewCampaignDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [hasError, setHasError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setHasError(true)
      return
    }

    setIsSubmitting(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from("assessment_campaigns")
        .insert({
          name: trimmedName,
          description: description.trim() || null,
          status: "draft",
          created_by: user?.id || null,
        })
        .select("id")
        .single()

      if (error) {
        console.error("Error creating campaign:", error)
        toast.add({
          title: "Error",
          description: "Failed to create campaign: " + error.message,
          type: "error",
        })
        setIsSubmitting(false)
        return
      }

      toast.add({
        title: "Success",
        description: "Campaign created successfully!",
        type: "success",
      })

      setOpen(false)
      setName("")
      setDescription("")
      setHasError(false)
      setIsSubmitting(false)

      // Refresh data and redirect to the newly created campaign's dynamic page
      router.refresh()
      router.push(`/protected/admin/assessments/${data.id}`)
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred."
      console.error("Unexpected error:", err)
      toast.add({
        title: "Error",
        description: errorMessage,
        type: "error",
      })
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val)
        if (!val) {
          setHasError(false)
          setName("")
          setDescription("")
        }
      }}
    >
      <DialogTrigger
        render={
          <Button className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            New Campaign
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create Assessment Campaign</DialogTitle>
            <DialogDescription>
              Create a new campaign to organize, group, and schedule evaluations.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="space-y-4 py-2">
            <Field>
              <Label htmlFor="campaign-name">Campaign Name *</Label>
              <Input
                id="campaign-name"
                name="name"
                value={name}
                placeholder="e.g., Q4 Engineering Assessment Campaign"
                aria-invalid={hasError}
                onChange={(e) => {
                  setName(e.target.value)
                  if (hasError) setHasError(false)
                }}
                disabled={isSubmitting}
                autoFocus
              />
              {hasError ? (
                <FieldDescription className="text-destructive flex items-center gap-1.5 mt-1">
                  <Info className="h-3.5 w-3.5" />
                  Campaign name is required
                </FieldDescription>
              ) : (
                <FieldDescription className="text-muted-foreground text-xs mt-1">
                  Give your campaign a clear and recognizable title.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <Label htmlFor="campaign-description">Description (Optional)</Label>
              <Textarea
                id="campaign-description"
                name="description"
                value={description}
                placeholder="Describe the campaign's purpose, scope, or scheduling window..."
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose
              render={
                <Button variant="outline" type="button" disabled={isSubmitting}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Campaign"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
