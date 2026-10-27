"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { linkForNotification } from "@/lib/assessment/notification-link"

interface NotificationRow {
  id: number
  type:
    | "upcoming"
    | "active_started"
    | "active_midpoint"
    | "active_due_soon"
    | "attempt_completed"
    | "preset_approved"
    | "preset_rejected"
  assessment_id: number | null
  attempt_id: number | null
  read_at: string | null
  created_at: string
  assessment_name: string | null
  completer_profile_id: string | null
  completer_given_name: string | null
  completer_last_name: string | null
  preset_name: string | null
  capability_id: number | null
}

const POLL_INTERVAL_MS = 60_000

function describe(row: NotificationRow): string {
  const name = row.assessment_name ?? "an assessment"
  switch (row.type) {
    case "upcoming":
      return `${name} will open soon.`
    case "active_started":
      return `${name} is now open.`
    case "active_midpoint":
      return `${name} is halfway through its window.`
    case "active_due_soon":
      return `${name} closes soon.`
    case "attempt_completed": {
      const completer =
        row.completer_given_name || row.completer_last_name
          ? `${row.completer_given_name ?? ""} ${row.completer_last_name ?? ""}`.trim()
          : "An employee"
      return `${completer} completed ${name}.`
    }
    case "preset_approved":
      return `${row.preset_name ?? "A preset"} was approved.`
    case "preset_rejected":
      return `${row.preset_name ?? "A preset"} was rejected.`
  }
}

/** The caller's notifications, or null if the request failed. */
async function loadNotifications(): Promise<NotificationRow[] | null> {
  try {
    const res = await fetch("/api/notifications")
    return res.ok ? ((await res.json()) as NotificationRow[]) : null
  } catch (err) {
    console.error("NotificationBell: failed to fetch notifications:", err)
    return null
  }
}

export function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationRow[]>([])

  function fetchNotifications() {
    loadNotifications().then((rows) => {
      if (rows) setNotifications(rows)
    })
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  async function handleSelect(row: NotificationRow) {
    if (!row.read_at) {
      try {
        await fetch(`/api/notifications/${row.id}/read`, { method: "POST" })
      } catch (err) {
        console.error("NotificationBell: failed to mark read:", err)
      }
    }
    const href = linkForNotification(row)
    if (href) router.push(href)
    fetchNotifications()
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton>
              <Bell />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {unreadCount}
                </Badge>
              )}
            </SidebarMenuButton>
          }
        />
        <DropdownMenuContent className="w-80">
          {notifications.length === 0 ? (
            <DropdownMenuItem disabled>No notifications yet.</DropdownMenuItem>
          ) : (
            notifications.map((row, i) => (
              <div key={row.id}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={() => handleSelect(row)}
                  className={row.read_at ? "text-muted-foreground" : "font-medium"}
                >
                  {describe(row)}
                </DropdownMenuItem>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
