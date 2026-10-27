"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"

/** "N mins / Untimed" that an admin can click to change. Blank saves as untimed. */
export function DurationEditor({ assessmentId, minutes }: { assessmentId: number; minutes: number | null | undefined }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(minutes ? String(minutes) : "")
  const [saving, setSaving] = useState(false)
  const skipBlurSave = useRef(false)

  async function save() {
    if (saving) return
    const next = value.trim() === "" ? null : Number(value)
    if (next === (minutes ?? null)) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/duration`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to save the duration.")
      setEditing(false)
      router.refresh()
    } catch (err) {
      skipBlurSave.current = false
      toast.add({ title: "Duration not saved", description: err instanceof Error ? err.message : String(err), type: "error" })
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-foreground" title="Set duration" onClick={() => {
          // A browser that doesn't blur on unmount can leave this stuck true from the last Escape.
          skipBlurSave.current = false
          setValue(minutes ? String(minutes) : "")
          setEditing(true)
        }}>
        {minutes ? `${minutes} mins` : "Untimed"}
      </button>
    )
  }
  return (
    <Input
      autoFocus
      type="number"
      min={1}
      max={600}
      placeholder="mins"
      className="h-6 w-20 text-xs"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (skipBlurSave.current) {
          skipBlurSave.current = false
          return
        }
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          skipBlurSave.current = true
          save()
        }
        if (e.key === "Escape") {
          skipBlurSave.current = true
          setValue(minutes ? String(minutes) : "")
          setEditing(false)
        }
      }}
    />
  )
}
