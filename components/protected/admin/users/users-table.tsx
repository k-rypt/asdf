"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { EllipsisVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isArchived, type ProfileStatus } from "@/lib/admin/account-status"
import { ArchiveUserDialog } from "./archive-user-dialog"
import { ReactivateUserDialog } from "./reactivate-user-dialog"
import { EditRolesDialog } from "./edit-roles-dialog"
import { EditDetailsDialog } from "./edit-details-dialog"

export interface UserRow {
  id: string
  name: string
  email: string
  roles: string[]
  status: ProfileStatus
}

type Filter = "active" | "archived" | "all"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" },
]

function statusBadge(status: ProfileStatus) {
  if (status === "inactive") return <Badge variant="destructive">Archived</Badge>
  if (status === "pending") return <Badge variant="outline">Pending</Badge>
  return <Badge variant="secondary">Active</Badge>
}

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [filter, setFilter] = useState<Filter>("active")
  const [archiveTarget, setArchiveTarget] = useState<UserRow | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<UserRow | null>(null)
  const [rolesTarget, setRolesTarget] = useState<UserRow | null>(null)
  const [detailsTarget, setDetailsTarget] = useState<UserRow | null>(null)
  const router = useRouter()

  const visible = users.filter((u) =>
    filter === "all" ? true : filter === "archived" ? isArchived(u.status) : !isArchived(u.status)
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "secondary" : "ghost"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">No users in this view.</div>
      ) : (
        <div className="rounded-md border divide-y">
          {visible.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">{u.name}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {u.roles.map((r) => (
                  <Badge key={r} variant="outline" className="capitalize">
                    {r}
                  </Badge>
                ))}
                {statusBadge(u.status)}
                {u.id !== currentUserId && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${u.name}`}>
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {isArchived(u.status) ? (
                        <DropdownMenuItem className="cursor-pointer" onClick={() => setReactivateTarget(u)}>
                          Reactivate
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => setDetailsTarget(u)}>
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => setRolesTarget(u)}>
                            Edit roles
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => setArchiveTarget(u)}
                          >
                            Archive
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {archiveTarget && (
        <ArchiveUserDialog
          user={archiveTarget}
          open={!!archiveTarget}
          onOpenChange={(v) => !v && setArchiveTarget(null)}
          onArchived={() => {
            setArchiveTarget(null)
            router.refresh()
          }}
        />
      )}
      {detailsTarget && (
        <EditDetailsDialog
          user={detailsTarget}
          open={!!detailsTarget}
          onOpenChange={(v) => !v && setDetailsTarget(null)}
          onSaved={() => {
            setDetailsTarget(null)
            router.refresh()
          }}
        />
      )}
      {rolesTarget && (
        <EditRolesDialog
          user={rolesTarget}
          open={!!rolesTarget}
          onOpenChange={(v) => !v && setRolesTarget(null)}
          onSaved={() => {
            setRolesTarget(null)
            router.refresh()
          }}
        />
      )}
      {reactivateTarget && (
        <ReactivateUserDialog
          user={reactivateTarget}
          open={!!reactivateTarget}
          onOpenChange={(v) => !v && setReactivateTarget(null)}
          onReactivated={() => {
            setReactivateTarget(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
