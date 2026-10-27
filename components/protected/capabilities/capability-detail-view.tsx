import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"
import { PencilIcon, AlertCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
// Badge moved to tab view
import { CapabilityTabs } from "./capability-tabs"
import { CapabilityStatusSelect } from "./capability-status-select"
import { CapabilityDescriptionEditor } from "./capability-description-editor"
import { AssignOwnerDialog } from "@/components/protected/admin/capabilities/assign-owner-dialog"
// SetActivePresetDialog moved to tab view
import { flagOverdueAssessments } from "@/lib/assessment/deadline-flags"
import type { AssignmentCandidate } from "@/lib/admin/assignment-candidates"
import { LEVEL_COLUMNS, rowToLevel } from "@/lib/assessment/ladder"
import { resolveEffectivePresetStatus } from "@/lib/admin/preset-approval-status"

/**
 * Shared capability detail view, rendered under both
 * app/protected/admin/capabilities/[capability] (any admin) and
 * app/protected/capability/[capability] (capability owners) -- the two
 * route trees only differ in their layout's role gate. One exception:
 * `canManage` (admin-only, same convention as CapabilityListView's
 * `canCreate`) gates the "Capability Owner"/"Preset In Use" cards, since
 * their pencil icons open AssignOwnerDialog/SetActivePresetDialog --
 * letting a capability owner reassign their own capability's owner is an
 * admin-only action. Also threaded into CapabilityTabs to gate the
 * Presets tab's "Build Assessment" action -- a capability owner can save
 * a preset, but only an admin turns it into a draft assessment (and,
 * later, publishes it from the Review page). See
 * require-capability-admin-client.ts for the matching decision on the
 * API side.
 *
 * `candidates` is the list the Assign-employees dialog may offer, chosen
 * by the caller's own scope (admin: every employee; manager: their
 * department). It is a prop, not a query here, precisely because this
 * view is shared and the two surfaces must not share a scope.
 */
export async function CapabilityDetailView({
  capabilityId,
  canManage = false,
  candidates = [],
}: {
  capabilityId: string
  canManage?: boolean
  candidates?: AssignmentCandidate[]
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: capability, error } = await supabase
    .from("capabilities")
    .select("*")
    .eq("id", capabilityId)
    .single()

  if (error || !capability) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Capability not found</p>
      </div>
    )
  }

  const [
    { data: questions },
    { data: rawPresets },
    { data: assignedProfiles },
    { data: owner },
    { data: ladderRows },
  ] = await Promise.all([
    supabase.from("questions").select("*").eq("capability_id", capabilityId),
    supabase.from("question_presets").select("*").eq("capability_id", capabilityId),
    supabase
      .from("profile_capabilities")
      .select("*, profiles!inner(*)")
      .eq("capability_id", capabilityId)
      .neq("profiles.status", "inactive"),
    capability.owner_id
      ? supabase.from("profiles").select("given_name, last_name, email").eq("id", capability.owner_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("capability_ladder_levels").select(LEVEL_COLUMNS).eq("capability_id", capabilityId).order("sfia_level"),
  ])
  const ladder = (ladderRows ?? []).map(rowToLevel)

  const presetIds = (rawPresets ?? []).map((p) => p.id)
  const [{ data: presetStatuses }, { data: presetQuestions }] = await Promise.all([
    presetIds.length > 0
      ? supabase.from("preset_current_status").select("preset_id, status").in("preset_id", presetIds)
      : Promise.resolve({ data: [] as { preset_id: number; status: string }[] }),
    presetIds.length > 0
      ? supabase.from("question_preset_questions").select("preset_id").in("preset_id", presetIds)
      : Promise.resolve({ data: [] as { preset_id: number }[] }),
  ])
  const statusByPresetId = new Map((presetStatuses ?? []).map((s) => [s.preset_id, s.status]))
  const questionCountByPresetId = new Map<number, number>()
  for (const item of presetQuestions ?? []) {
    questionCountByPresetId.set(item.preset_id, (questionCountByPresetId.get(item.preset_id) ?? 0) + 1)
  }
  const presets = (rawPresets ?? []).map((p) => ({
    ...p,
    status: resolveEffectivePresetStatus(statusByPresetId.get(p.id), p.id, capability.current_preset),
    questionCount: questionCountByPresetId.get(p.id) ?? 0,
  }))

  const activePreset = presets.find((p) => p.id === capability.current_preset) ?? null

  // Flow 4: overdue employees on this capability -- see the spec's
  // "Deadline-flag upsert mechanism" and "Flow 4". Excludes only
  // 'management' assignments (capability owners, not test-takers);
  // 'assessment' (invite flow) and 'assigned' (Manage Profiles dialog)
  // are both real test-takers subject to the window -- narrowing this to
  // 'assessment' only, as originally planned, silently hid
  // Manage-Profiles-assigned employees from this list (final-review
  // finding, fixed here; same fix as app/protected/manager/page.tsx).
  const assessmentAssignees = (assignedProfiles ?? []).filter((ap) => ap.assignment_type !== "management")

  const { data: publishedAssessment } = await supabase
    .from("assessments")
    .select("id, available_from, available_until")
    .eq("capability_id", capabilityId)
    .eq("status", "published")
    .maybeSingle()

  let overdueProfiles: { profileId: string; givenName: string; lastName: string; email: string; deadline: string | null }[] = []

  if (publishedAssessment && assessmentAssignees.length > 0) {
    const deadlineCandidates = assessmentAssignees.map((ap) => ({
      assessmentId: publishedAssessment.id as number,
      profileId: ap.profile_id as string,
      capabilityId: Number(capabilityId),
      availableFrom: publishedAssessment.available_from as string | null,
      availableUntil: publishedAssessment.available_until as string | null,
      addedAt: ap.added_at as string,
    }))
    await flagOverdueAssessments(supabase, deadlineCandidates)

    const { data: flaggedRows } = await supabase
      .from("assessment_deadline_flags")
      .select("profile_id")
      .eq("assessment_id", publishedAssessment.id)
      .in("profile_id", assessmentAssignees.map((ap) => ap.profile_id))
    const overdueIds = new Set((flaggedRows ?? []).map((f) => f.profile_id as string))

    overdueProfiles = assessmentAssignees
      .filter((ap) => overdueIds.has(ap.profile_id))
      .map((ap) => ({
        profileId: ap.profile_id,
        givenName: ap.profiles?.given_name ?? "",
        lastName: ap.profiles?.last_name ?? "",
        email: ap.profiles?.email ?? "",
        deadline: publishedAssessment.available_until as string | null,
      }))
  }

  const activePresetQuestionCount = activePreset ? (questionCountByPresetId.get(activePreset.id) ?? 0) : 0;

  return (
    <div className="py-6 pt-3 max-w-6xl mx-auto w-full space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link 
          href={canManage ? "/protected/admin/capabilities" : "/protected/capability"} 
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {canManage ? "Capabilities" : "Catalogues"}
        </Link>

        {!canManage && (
          <Link
            href={`/protected/capability/${capabilityId}/employees`}
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View employee progress
          </Link>
        )}
      </div>
      {/* Alert for Capability Owners when Capability is not active */}
      {!canManage && capability.status !== 'active' && (
        <Alert variant="default" className="bg-yellow-500 text-foreground border-2 border-yellow-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="capitalize">Capability {capability.status}</AlertTitle>
          <AlertDescription className="text-foreground">
            This capability has been marked as {capability.status}. Assessments cannot be taken or assigned while it is in this state.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-0">
          <h1 className="text-2xl font-bold tracking-tight">{capability.name}</h1>
          <CapabilityDescriptionEditor capabilityId={capabilityId} initialDescription={capability.description} />
        </div>
        {canManage && (
          <CapabilityStatusSelect capabilityId={capabilityId} currentStatus={capability.status} disabled={false} />
        )}
      </div>

      {canManage && (
        <div className="max-w-md">
          <Card className="border-muted-foreground/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium tracking-wider uppercase text-muted-foreground">Capability Owner</CardTitle>
              <AssignOwnerDialog
                capabilityId={capabilityId}
                currentOwnerId={capability.owner_id}
                trigger={
                  <button type="button" title="Assign capability owner">
                    <PencilIcon className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                  </button>
                }
              />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {owner ? `${owner.given_name} ${owner.last_name}` : "Unassigned"}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{owner?.email ?? "No email available"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <CapabilityTabs
        capabilityId={capabilityId}
        questions={questions || []}
        presets={presets}
        ladder={ladder}
        assignedProfiles={assignedProfiles || []}
        overdueProfiles={overdueProfiles}
        canManage={canManage}
        candidates={candidates}
        currentPresetId={capability.current_preset}
        activePresetQuestionCount={activePresetQuestionCount}
        capabilityUpdatedAt={capability.updated_at}
      />
    </div>
  )
}
