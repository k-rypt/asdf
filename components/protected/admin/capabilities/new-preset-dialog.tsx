"use client"

import { useState, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogClose, DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, FieldGroup } from "@/components/ui/field"
import { toast } from "@/components/ui/toast"

interface NewPresetDialogProps {
  capabilityId: string
  trigger: React.ReactNode
}

export function NewPresetDialog({ capabilityId, trigger }: NewPresetDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    startTransition(async () => {
      const { error } = await supabase.from("question_presets").insert({
        name: name.trim(),
        capability_id: Number(capabilityId),
      })
      if (error) {
        toast.add({ title: "Couldn't create preset", description: error.message, type: "error" })
        return
      }
      setName("")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Preset</DialogTitle>
          </DialogHeader>
          <FieldGroup className="mt-2">
            <Field>
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                placeholder="e.g. Junior Developer Set"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? "Creating..." : "Create Preset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
