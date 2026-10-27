import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"
import { ApprovalsList } from "@/components/protected/admin/approvals/approvals-list"
import type { ReviewQuestion } from "@/components/protected/admin/approvals/review-preset-dialog"
import { isPendingApprovalActive } from "@/lib/admin/preset-approval-status"

export default async function AdminApprovalsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: pendingStatuses } = await supabase
    .from("preset_current_status")
    .select("preset_id, created_by, created_at, note")
    .eq("status", "pending_approval")

  const presetIds = (pendingStatuses ?? []).map((s) => s.preset_id)
  const submitterIds = (pendingStatuses ?? []).map((s) => s.created_by).filter(Boolean) as string[]

  const [{ data: presets }, { data: submitters }, { data: presetQuestionsData }] = await Promise.all([
    presetIds.length > 0
      ? supabase
          .from("question_presets")
          .select("id, name, description, duration_minutes, passing_score, question_type_mix, capability_id, capabilities!question_presets_capability_id_fkey(id, name, current_preset)")
          .in("id", presetIds)
      : Promise.resolve({
          data: [] as {
            id: number
            name: string
            description: string | null
            duration_minutes: number | null
            passing_score: number | null
            question_type_mix: Record<string, number> | null
            capability_id: number
            capabilities: unknown
          }[],
        }),
    submitterIds.length > 0
      ? supabase.from("profiles").select("id, given_name, last_name").in("id", submitterIds)
      : Promise.resolve({ data: [] as { id: string; given_name: string | null; last_name: string | null }[] }),
    presetIds.length > 0
      ? supabase
          .from("question_preset_questions")
          .select(`
            preset_id,
            position,
            questions (
              id,
              type,
              title,
              description,
              status,
              sfia_level,
              bloom_level,
              sample_input,
              sample_output,
              constraints,
              starter_code,
              expected_concepts,
              question_choices (
                id,
                context,
                is_correct
              )
            )
          `)
          .in("preset_id", presetIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const submitterById = new Map((submitters ?? []).map((s) => [s.id, s]))
  const statusByPresetId = new Map((pendingStatuses ?? []).map((s) => [s.preset_id, s]))

  // Group questions by preset_id
  const questionsByPresetId = new Map<number, ReviewQuestion[]>()
  for (const item of (presetQuestionsData ?? [])) {
    if (!item.questions) continue
    const q = Array.isArray(item.questions) ? item.questions[0] : item.questions
    if (!q || !q.id) continue

    const rawChoices = q.question_choices ?? []
    const choices = (Array.isArray(rawChoices) ? rawChoices : [rawChoices]).map((c: any) => ({
      id: c.id,
      context: c.context ?? "",
      isCorrect: Boolean(c.is_correct),
    }))

    const list = questionsByPresetId.get(item.preset_id) ?? []
    list.push({
      id: String(q.id),
      title: q.title ?? "Untitled Question",
      description: q.description ?? null,
      type: q.type ?? null,
      status: q.status ?? null,
      sfiaLevel: q.sfia_level != null ? Number(q.sfia_level) : null,
      bloomLevel: q.bloom_level ?? null,
      sampleInput: q.sample_input ?? null,
      sampleOutput: q.sample_output ?? null,
      constraints: q.constraints ?? null,
      starterCode: q.starter_code ?? null,
      expectedConcepts: Array.isArray(q.expected_concepts) ? q.expected_concepts : null,
      choices,
    })
    questionsByPresetId.set(item.preset_id, list)
  }

  const rows = (presets ?? [])
    .filter((preset) => {
      const capability = Array.isArray(preset.capabilities)
        ? (preset.capabilities[0] as { id?: number; name?: string; current_preset?: number | null } | undefined)
        : (preset.capabilities as { id?: number; name?: string; current_preset?: number | null } | null)
      // Only presets currently set as the active preset for their capability should be in the approval queue.
      // If removed as active, the approval request disappears.
      return isPendingApprovalActive(preset.id, capability?.current_preset)
    })
    .map((preset) => {
    const statusRow = statusByPresetId.get(preset.id)
    const submitter = statusRow ? submitterById.get(statusRow.created_by) : undefined
    const capability = Array.isArray(preset.capabilities)
      ? (preset.capabilities[0] as { id?: number; name?: string; current_preset?: number | null } | undefined)
      : (preset.capabilities as { id?: number; name?: string; current_preset?: number | null } | null)
    const questions = questionsByPresetId.get(preset.id) ?? []

    const isPresetInUse = Boolean(
      (capability?.current_preset != null && capability.current_preset === preset.id) ||
      (statusRow?.note != null &&
        (statusRow.note.toLowerCase().includes("active preset") ||
         statusRow.note.toLowerCase().includes("preset in use")))
    )

    return {
      presetId: preset.id as number,
      presetName: preset.name as string,
      description: (preset.description as string) ?? null,
      durationMinutes: (preset.duration_minutes as number) ?? null,
      passingScore: (preset.passing_score as number) ?? null,
      questionTypeMix: (preset.question_type_mix as Record<string, number>) ?? null,
      capabilityId: preset.capability_id as number,
      capabilityName: (capability?.name as string) ?? "Unknown",
      isPresetInUse,
      note: (statusRow?.note as string) ?? null,
      questionCount: questions.length,
      submittedByName: submitter ? `${submitter.given_name} ${submitter.last_name}` : "Unknown",
      submittedAt: (statusRow?.created_at as string) ?? null,
      questions,
    }
  })

  return (
    <main className="flex justify-center min-h-svh w-full">
      <div className="w-full max-w-6xl mt-5 flex flex-col p-4 lg:p-0">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Presets submitted by capability owners, awaiting a decision.
          </p>
        </header>
        <ApprovalsList rows={rows} />
      </div>
    </main>
  )
}
