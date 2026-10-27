"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function NewCapability() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    
    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    if (!name) {
      alert("Capability Name is required")
      return
    }

    const { error } = await supabase
      .from("capabilities")
      .insert({
        name,
        description: description || null,
        owner_id: null,
      })
      .select()

    if (error) {
      console.error("Error inserting capability:", error)
      alert("Failed to create capability.")
    } else {
      alert("Capability created successfully!")
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Open Dialog</Button>} />
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Capability</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="name-1">How will you label this skill?</Label>
              <Input id="name-1" name="name" placeholder="Name of Capability" required />
            </Field>
            <Field>
              <Label htmlFor="description-1">Explain this skill</Label>
              <Textarea id="description-1" name="description" placeholder="Describe the capability..." />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
            <Button type="submit">Create Capability</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
