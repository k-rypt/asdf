"use client"

import { useState, useEffect, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  UserPlus,
  ChevronDown,
  Check,
  X,
  AlertTriangle,
} from "lucide-react"

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------
interface Department {
  id: number
  name: string
}

interface Capability {
  id: number
  name: string
  owner_id: string | null
}

interface RoleOption {
  id: number
  name: string
  label: string
  description: string
}

const ROLES: RoleOption[] = [
  {
    id: 1,
    name: "admin",
    label: "Admin",
    description: "Full system access. Can manage users, roles, capabilities, and all platform settings.",
  },
  {
    id: 2,
    name: "manager",
    label: "Manager",
    description: "Oversees a department. Can view employee assessments and performance within their assigned department.",
  },
  {
    id: 4,
    name: "employee",
    label: "Employee",
    description: "Takes assessments for assigned capabilities. Can view their own scores and progress.",
  },
  {
    id: 3,
    name: "capability owner",
    label: "Capability Owner",
    description: "Manages one or more capabilities. Can create questions, configure assessments, and view results for their capabilities.",
  },
]

// -----------------------------------------------------------------
// Multi-Select Dropdown (checkbox list in a popover)
// -----------------------------------------------------------------
function MultiSelectCapabilities({
  label,
  capabilities,
  selected,
  onChange,
}: {
  label: string
  capabilities: Capability[]
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const selectedNames = capabilities
    .filter((c) => selected.includes(c.id))
    .map((c) => c.name)

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-input bg-input/20 px-3 py-2 text-xs/relaxed transition-colors hover:bg-input/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
          }
        >
          <span className="flex-1 text-left truncate">
            {selectedNames.length === 0 ? (
              <span className="text-muted-foreground">Select capabilities...</span>
            ) : (
              <span>{selectedNames.join(", ")}</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="max-h-60 overflow-y-auto divide-y">
            {capabilities.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No capabilities available.
              </div>
            ) : (
              capabilities.map((cap) => (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => toggle(cap.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                      selected.includes(cap.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    }`}
                  >
                    {selected.includes(cap.id) && (
                      <Check className="h-3 w-3" />
                    )}
                  </div>
                  <span className="text-xs font-medium">{cap.name}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {/* Selected chips */}
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {capabilities
            .filter((c) => selected.includes(c.id))
            .map((c) => (
              <Badge
                key={c.id}
                variant="secondary"
                className="gap-1 pr-1"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// Invite User Dialog
// -----------------------------------------------------------------
export function InviteUserDialog() {
  const router = useRouter()
  // One client for the dialog's lifetime, so the fetch effect can depend on it.
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [givenName, setGivenName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<Set<number>>(new Set())
  const [employeeCapIds, setEmployeeCapIds] = useState<number[]>([])
  const [ownerCapIds, setOwnerCapIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  // Reference data
  const [departments, setDepartments] = useState<Department[]>([])
  const [allCapabilities, setAllCapabilities] = useState<Capability[]>([])

  // Derived
  const unownedCapabilities = allCapabilities.filter((c) => c.owner_id === null)
  const capOwnerDisabled = unownedCapabilities.length === 0
  // With no capability left to own, Capability Owner can't be chosen --
  // drop it if it was ticked earlier, rather than resetting state.
  const effectiveRoles = capOwnerDisabled
    ? new Set(Array.from(selectedRoles).filter((id) => id !== 3))
    : selectedRoles
  const hasEmployee = effectiveRoles.has(4)
  const hasManager = effectiveRoles.has(2)
  const hasCapOwner = effectiveRoles.has(3)

  // Fetch reference data when dialog opens
  useEffect(() => {
    if (!open) return
    async function fetchData() {
      const [{ data: depts }, { data: caps }] = await Promise.all([
        supabase.from("departments").select("id, name").order("id"),
        supabase.from("capabilities").select("id, name, owner_id").order("id"),
      ])
      setDepartments(depts ?? [])
      setAllCapabilities(caps ?? [])
    }
    fetchData()
  }, [open, supabase])

  // Clears the form on close, so the next invite starts blank.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setGivenName("")
      setLastName("")
      setEmail("")
      setJobTitle("")
      setDepartmentId(null)
      setSelectedRoles(new Set())
      setEmployeeCapIds([])
      setOwnerCapIds([])
      setError(null)
      setWarning(null)
    }
  }

  function toggleRole(roleId: number) {
    const next = new Set(selectedRoles)
    if (next.has(roleId)) {
      next.delete(roleId)
      // Clear conditional data when role is deselected
      if (roleId === 4) setEmployeeCapIds([])
      if (roleId === 3) setOwnerCapIds([])
    } else {
      next.add(roleId)
    }
    setSelectedRoles(next)
  }

  async function handleSubmit() {
    setError(null)
    setWarning(null)

    // Client-side validation
    if (!givenName.trim() || !lastName.trim() || !email.trim()) {
      setError("Given name, last name, and email are required.")
      return
    }
    if (effectiveRoles.size === 0) {
      setError("Select at least one role.")
      return
    }
    if (hasManager && !departmentId) {
      setError("Manager role requires a department.")
      return
    }
    if (hasCapOwner && ownerCapIds.length === 0) {
      setError("Capability Owner role requires at least one capability.")
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/users/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            givenName: givenName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            jobTitle: jobTitle.trim() || undefined,
            departmentId: departmentId ?? undefined,
            roleIds: Array.from(effectiveRoles),
            employeeCapabilityIds: hasEmployee ? employeeCapIds : undefined,
            ownerCapabilityIds: hasCapOwner ? ownerCapIds : undefined,
          }),
        })

        const data = await res.json()

        if (res.status === 409) {
          // Duplicate email — show as a warning, keep the dialog open
          setWarning(data.error)
          return
        }

        if (!res.ok) {
          setError(data.error || "Something went wrong.")
          return
        }

        handleOpenChange(false)
        router.refresh()
      } catch {
        setError("Network error. Please try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <UserPlus className="h-3.5 w-3.5" />
        Add Users
      </Button>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite New User</DialogTitle>
          <DialogDescription>
            Send an invitation email and create the user&apos;s profile with pre-assigned roles and capabilities.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Personal Information ─────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
              Personal Information
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-given-name">Given Name</Label>
                <Input
                  id="inv-given-name"
                  placeholder="Juan"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-last-name">Last Name</Label>
                <Input
                  id="inv-last-name"
                  placeholder="Dela Cruz"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                placeholder="juan@metrobank.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-job-title">Job Title</Label>
              <Input
                id="inv-job-title"
                placeholder="Web Developer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <Separator />

          {/* ── Department ─────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
              Department
            </p>
            <Select
              value={departmentId?.toString() ?? ""}
              onValueChange={(val) => setDepartmentId(Number(val))}
              disabled={isPending}
              // Base UI's <SelectValue> renders the selected item's raw
              // `value` unless the root is told how to map it to a label
              // -- without this, the closed trigger shows the department
              // id instead of its name.
              items={departments.map((dept) => ({ value: dept.id.toString(), label: dept.name }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select department..." />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* ── Assigned Roles ────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
              Assigned Roles
            </p>

            <div className="space-y-3">
              {ROLES.map((role) => {
                const isDisabled =
                  role.id === 3 && capOwnerDisabled
                const isChecked = effectiveRoles.has(role.id)

                return (
                  <label
                    key={role.id}
                    className={`flex items-start gap-3 rounded-md border p-3 transition-colors cursor-pointer hover:bg-muted/50 ${
                      isChecked
                        ? "border-primary/50 bg-primary/5"
                        : "border-border"
                    } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => {
                        if (!isDisabled) toggleRole(role.id)
                      }}
                      disabled={isDisabled || isPending}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{role.label}</span>
                        {role.id === 3 && capOwnerDisabled && (
                          <Badge variant="outline" className="text-[0.5rem]">
                            No unassigned capabilities
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {role.description}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── Conditional: Manager Department Note ─── */}
          {hasManager && departmentId && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                  Manager Assignment
                </p>
                <p className="text-xs text-muted-foreground">
                  This user will manage the{" "}
                  <span className="font-medium text-foreground">
                    {departments.find((d) => d.id === departmentId)?.name}
                  </span>{" "}
                  department.
                </p>
              </div>
            </>
          )}

          {/* ── Conditional: Employee Capabilities ──── */}
          {hasEmployee && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                  Employee Assessment Capabilities
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Select the capabilities this employee will be assessed on.
                </p>
                <MultiSelectCapabilities
                  label=""
                  capabilities={allCapabilities}
                  selected={employeeCapIds}
                  onChange={setEmployeeCapIds}
                />
              </div>
            </>
          )}

          {/* ── Conditional: Capability Owner ──────── */}
          {hasCapOwner && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                  Owned Capabilities
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Select the capabilities this user will own and manage. Only unassigned capabilities are shown.
                </p>
                <MultiSelectCapabilities
                  label=""
                  capabilities={unownedCapabilities}
                  selected={ownerCapIds}
                  onChange={setOwnerCapIds}
                />
              </div>
            </>
          )}

          {/* ── Error ────────────────────────────────── */}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
          {warning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-300">{warning}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button">Cancel</Button>} />
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Sending Invite..." : "Send Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
