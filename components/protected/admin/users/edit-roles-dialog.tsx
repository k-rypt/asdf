"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ROLE_OPTIONS, roleSetupNotes } from "@/lib/admin/role-edit"

interface EditRolesDialogProps {
  user: { id: string; name: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

interface RoleState {
  roleIds: number[]
  managesDepartment: boolean
  ownsCapability: boolean
}

export function EditRolesDialog({ user, open, onOpenChange, onSaved }: EditRolesDialogProps) {
  const [loaded, setLoaded] = useState<RoleState | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`/api/admin/users/${user.id}/roles`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? "Failed to load roles.")
        if (!cancelled) {
          setLoaded(data as RoleState)
          setSelected((data as RoleState).roleIds)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load roles.")
      })
    return () => {
      cancelled = true
    }
  }, [open, user.id])

  function toggle(roleId: number, checked: boolean) {
    setSelected((ids) => (checked ? [...ids, roleId] : ids.filter((id) => id !== roleId)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: selected }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to save roles.")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save roles.")
    } finally {
      setSaving(false)
    }
  }

  const notes = loaded ? roleSetupNotes(selected, loaded) : []
  const unchanged =
    loaded !== null &&
    selected.length === loaded.roleIds.length &&
    selected.every((id) => loaded.roleIds.includes(id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit roles for {user.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {error && <p className="text-destructive">{error}</p>}
          {loaded === null && !error ? (
            <p className="text-muted-foreground">Loading roles…</p>
          ) : (
            loaded && (
              <>
                <div className="flex flex-col gap-2.5">
                  {ROLE_OPTIONS.map((role) => (
                    <label key={role.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selected.includes(role.id)}
                        onCheckedChange={(checked) => toggle(role.id, checked === true)}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
                {selected.length === 0 && (
                  <p className="text-destructive">Keep at least one role -- without one they can&apos;t sign in.</p>
                )}
                {notes.map((note) => (
                  <p key={note} className="rounded-md border bg-muted/50 p-3 text-muted-foreground">
                    {note}
                  </p>
                ))}
              </>
            )
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleSave} disabled={saving || !loaded || selected.length === 0 || unchanged}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
