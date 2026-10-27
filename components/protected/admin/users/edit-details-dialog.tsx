"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface EditDetailsDialogProps {
  user: { id: string; name: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

interface Details {
  givenName: string
  lastName: string
  jobTitle: string
}

export function EditDetailsDialog({ user, open, onOpenChange, onSaved }: EditDetailsDialogProps) {
  const [loaded, setLoaded] = useState<Details | null>(null)
  const [form, setForm] = useState<Details>({ givenName: "", lastName: "", jobTitle: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`/api/admin/users/${user.id}/details`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "Failed to load details.")
        if (!cancelled) {
          setLoaded(data as Details)
          setForm(data as Details)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load details.")
      })
    return () => {
      cancelled = true
    }
  }, [open, user.id])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to save details.")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save details.")
    } finally {
      setSaving(false)
    }
  }

  const missingName = !form.givenName.trim() || !form.lastName.trim()
  const unchanged =
    loaded !== null &&
    form.givenName.trim() === loaded.givenName &&
    form.lastName.trim() === loaded.lastName &&
    form.jobTitle.trim() === loaded.jobTitle

  const field = (key: keyof Details, label: string, placeholder: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`details-${key}`}>{label}</Label>
      <Input
        id={`details-${key}`}
        value={form[key]}
        placeholder={placeholder}
        maxLength={100}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit details for {user.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {error && <p className="text-destructive">{error}</p>}
          {loaded === null && !error ? (
            <p className="text-muted-foreground">Loading details…</p>
          ) : (
            loaded && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {field("givenName", "First name", "e.g. Ana")}
                  {field("lastName", "Last name", "e.g. Cruz")}
                </div>
                {field("jobTitle", "Job title (optional)", "e.g. QA Engineer")}
              </>
            )
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleSave} disabled={saving || !loaded || missingName || unchanged}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
