"use client"

import { useEffect, useState } from "react"

/**
 * Shown before publishing: people mid-attempt on the current version keep
 * going on it rather than being cut off. Renders nothing when nobody is.
 */
export function LiveAttemptsNote({ capabilityId }: { capabilityId: number | string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/capabilities/${capabilityId}/live-attempts`)
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => {
        if (!cancelled) setCount(Number(data?.count) || 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [capabilityId])

  if (count === 0) return null
  return (
    <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
      {count === 1 ? "1 employee is" : `${count} employees are`} taking the current version right now. They&apos;ll
      finish on it; new starters get this one.
    </p>
  )
}
