"use client"

import { useMemo, useState } from "react"
import { Search, UserRound } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  ManageProfilesDialog,
  type Profile,
} from "@/components/protected/admin/capabilities/manage-profiles-dialog"
import type { AssignmentCandidate } from "@/lib/admin/assignment-candidates"

interface CapabilityOption {
  id: string
  name: string
  status: string | null
}

interface AssignCapabilityProps {
  capabilities: CapabilityOption[]
  /** Only the people this manager may assign; chosen server-side. */
  candidates: AssignmentCandidate[]
  /** (capability, profile) pairs already assigned, restricted to candidates. */
  assignments: { capabilityId: string; profileId: string }[]
}

/**
 * The manager's "Assign Capability" surface: pick a capability, then add or
 * remove your employees. Reuses ManageProfilesDialog -- the same component
 * the admin capability view uses -- but feeds it the manager-scoped
 * candidate list, so the two surfaces cannot drift apart.
 */
export function ManagerAssignCapabilityClient({
  capabilities,
  candidates,
  assignments,
}: AssignCapabilityProps) {
  const [search, setSearch] = useState("")
  const [openCapabilityId, setOpenCapabilityId] = useState<string | null>(null)

  const candidateById = useMemo(
    () => new Map<string, Profile>(candidates.map((c) => [c.id, c])),
    [candidates]
  )

  const assignedByCapability = useMemo(() => {
    const map = new Map<string, { profile_id: string; profiles: Profile | null }[]>()
    for (const a of assignments) {
      const profile = candidateById.get(a.profileId)
      // A profile outside the candidate list would be someone else's
      // employee; the dialog must not show them (see the page's query).
      if (!profile) continue
      const list = map.get(a.capabilityId) ?? []
      list.push({ profile_id: a.profileId, profiles: profile })
      map.set(a.capabilityId, list)
    }
    return map
  }, [assignments, candidateById])

  const filteredCapabilities = capabilities.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const openCapability = capabilities.find((c) => c.id === openCapabilityId) ?? null

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <UserRound className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No employees to assign</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can assign employees from the departments you manage. None of
            them are currently taking assessments.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assign Capability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a capability, then add or remove the people in your departments.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search capabilities..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredCapabilities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No capabilities found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCapabilities.map((capability) => {
            const assigned = assignedByCapability.get(capability.id) ?? []
            return (
              <Card key={capability.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{capability.name}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {assigned.length} assigned
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    onClick={() => setOpenCapabilityId(capability.id)}
                  >
                    <UserRound className="mr-2 h-4 w-4" />
                    Assign employees
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {openCapability && (
        <ManageProfilesDialog
          capabilityId={openCapability.id}
          assignedProfiles={assignedByCapability.get(openCapability.id) ?? []}
          candidates={candidates}
          open
          onOpenChange={(v) => !v && setOpenCapabilityId(null)}
        />
      )}
    </div>
  )
}
