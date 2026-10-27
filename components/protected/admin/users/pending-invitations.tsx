"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Mail,
  User,
  Briefcase,
  Clock,
  Building2,
  Shield,
  BookOpen,
  CalendarDays,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------
interface InvitationCapability {
  id: number
  name: string
}

interface Invitation {
  id: number
  token: string
  email: string
  given_name: string
  last_name: string
  job_title: string | null
  department_id: number | null
  department_name: string | null
  assigned_roles: number[]
  role_names: string[]
  capabilities: InvitationCapability[]
  status: "pending" | "claimed" | "expired"
  created_at: string
  expires_at: string
}

// -----------------------------------------------------------------
// Status badge styling
// -----------------------------------------------------------------
function statusVariant(status: Invitation["status"]) {
  switch (status) {
    case "pending":
      return "outline" as const
    case "claimed":
      return "default" as const
    case "expired":
      return "destructive" as const
  }
}

function statusLabel(status: Invitation["status"]) {
  switch (status) {
    case "pending":
      return "Pending"
    case "claimed":
      return "Claimed"
    case "expired":
      return "Expired"
  }
}

// -----------------------------------------------------------------
// Role-specific display helpers
// -----------------------------------------------------------------
function hasRole(inv: Invitation, roleName: string) {
  return inv.role_names.some((r) => r.toLowerCase() === roleName)
}

// -----------------------------------------------------------------
// Component
// -----------------------------------------------------------------
export function PendingInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Invitation | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [actionLoading] = useState(false)

  // loading starts true; state is only set once the fetch settles.
  useEffect(() => {
    fetch("/api/admin/invitations")
      .then(async (res) => {
        if (res.ok) setInvitations(await res.json())
      })
      .catch((err) => console.error("Failed to fetch invitations:", err))
      .finally(() => setLoading(false))
  }, [])

  function openDrawer(inv: Invitation) {
    setSelected(inv)
    setSheetOpen(true)
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function isExpired(inv: Invitation) {
    return inv.status === "expired" || new Date(inv.expires_at) < new Date()
  }

  // ---------------------------------------------------------------
  // Render: Table
  // ---------------------------------------------------------------
  return (
    <>
      <div className="rounded-md border">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading invitations...
          </div>
        ) : invitations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No invitations found. Invite a user to get started.
          </div>
        ) : (
          <div className="divide-y">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_120px] gap-4 px-4 py-3 bg-muted/50">
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Invitee
              </p>
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Roles
              </p>
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Sent
              </p>
              <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Status
              </p>
            </div>

            {/* Table Rows */}
            {invitations.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => openDrawer(inv)}
                className="w-full grid grid-cols-[1fr_1fr_1fr_120px] gap-4 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium">
                    {inv.given_name} {inv.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{inv.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {inv.role_names.map((role) => (
                    <Badge key={role} variant="secondary" className="capitalize">
                      {role}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center">
                  <p className="text-sm text-muted-foreground">
                    {formatDate(inv.created_at)}
                  </p>
                </div>
                <div className="flex items-center">
                  <Badge variant={statusVariant(inv.status)}>
                    {statusLabel(inv.status)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Drawer / Sheet — Invitation Details                           */}
      {/* ------------------------------------------------------------- */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Invitation Details</SheetTitle>
                <SheetDescription>
                  Sent to{" "}
                  <span className="font-medium text-foreground">
                    {selected.email}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <div className="p-6 space-y-6">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                    Status
                  </span>
                  <Badge variant={statusVariant(selected.status)}>
                    {statusLabel(selected.status)}
                  </Badge>
                </div>

                <Separator />

                {/* Personal Info */}
                <div className="space-y-4">
                  <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                    Personal Information
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Full Name</p>
                        <p className="text-sm font-medium">
                          {selected.given_name} {selected.last_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm font-medium">{selected.email}</p>
                      </div>
                    </div>
                    {selected.job_title && (
                      <div className="flex items-center gap-3">
                        <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Job Title
                          </p>
                          <p className="text-sm font-medium">
                            {selected.job_title}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Assigned Roles */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                    Assigned Roles
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.role_names.map((role) => (
                      <Badge
                        key={role}
                        variant="secondary"
                        className="gap-1.5 capitalize"
                      >
                        <Shield className="h-3 w-3" />
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Manager → Department */}
                {hasRole(selected, "manager") && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                        Department Assignment
                      </h4>
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">
                          {selected.department_name ?? "Not assigned"}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Capability Owner → Capabilities */}
                {hasRole(selected, "capability owner") &&
                  selected.capabilities.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                          Capabilities (Owner)
                        </h4>
                        <div className="space-y-2">
                          {selected.capabilities.map((cap) => (
                            <div
                              key={cap.id}
                              className="flex items-center gap-3 rounded-md border px-3 py-2"
                            >
                              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                              <p className="text-sm font-medium">{cap.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                {/* Employee → Assigned Capabilities */}
                {hasRole(selected, "employee") &&
                  selected.capabilities.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                          Assessment Capabilities
                        </h4>
                        <div className="space-y-2">
                          {selected.capabilities.map((cap) => (
                            <div
                              key={cap.id}
                              className="flex items-center gap-3 rounded-md border px-3 py-2"
                            >
                              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                              <p className="text-sm font-medium">{cap.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                <Separator />

                {/* Timestamps */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                    Timeline
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Sent On</p>
                        <p className="text-sm font-medium">
                          {formatDate(selected.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Expires On
                        </p>
                        <p
                          className={`text-sm font-medium ${
                            isExpired(selected)
                              ? "text-destructive"
                              : ""
                          }`}
                        >
                          {formatDate(selected.expires_at)}
                          {isExpired(selected) && " (Expired)"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Actions */}
                {selected.status === "pending" && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                      Actions
                    </h4>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={actionLoading}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resend Invite
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        disabled={actionLoading}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
