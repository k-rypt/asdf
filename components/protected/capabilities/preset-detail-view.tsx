import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { PresetDetailClient, type PresetQuestion, type ApprovalHistoryItem } from "./preset-detail-client"
import { resolveEffectivePresetStatus } from "@/lib/admin/preset-approval-status"

interface PresetDetailViewProps {
  capabilityId: string
  presetId: string
  backHref: string
  canManage?: boolean
}

export async function PresetDetailView({
  capabilityId,
  presetId,
  backHref,
  canManage = false,
}: PresetDetailViewProps) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const [
    { data: preset, error: presetError },
    { data: capability, error: capabilityError },
    { data: statusRow },
    { data: presetQuestionRows, error: presetQuestionsError },
    { data: capabilityQuestions, error: capabilityQuestionsError },
    { data: approvalHistoryRows, error: approvalHistoryError },
  ] = await Promise.all([
    supabase
      .from("question_presets")
      .select(
        "id, name, description, duration_minutes, passing_score, question_type_mix, capability_id, created_at, created_by"
      )
      .eq("id", presetId)
      .maybeSingle(),
    supabase
      .from("capabilities")
      .select("id, name, current_preset")
      .eq("id", capabilityId)
      .maybeSingle(),
    supabase
      .from("preset_current_status")
      .select("status")
      .eq("preset_id", presetId)
      .maybeSingle(),
    supabase
      .from("question_preset_questions")
      .select("question_id, questions(id, title, type, status, description, sfia_level, bloom_level, created_at)")
      .eq("preset_id", presetId),
    supabase
      .from("questions")
      .select("id, title, type, status, description, sfia_level, bloom_level, created_at")
      .eq("capability_id", capabilityId),
    supabase
      .from("preset_approvals")
      .select("id, action, note, created_at, created_by, profiles(given_name, last_name, email)")
      .eq("preset_id", presetId)
      .order("created_at", { ascending: false }),
  ])

  if (presetError || !preset) {
    if (presetError) {
      console.error("PresetDetailView: error loading preset:", presetError)
    }
    return notFound()
  }

  if (capabilityError) {
    console.error("PresetDetailView: error loading capability:", capabilityError)
  }
  if (presetQuestionsError) {
    console.error("PresetDetailView: error loading preset questions:", presetQuestionsError)
  }
  if (capabilityQuestionsError) {
    console.error("PresetDetailView: error loading capability questions:", capabilityQuestionsError)
  }
  if (approvalHistoryError) {
    console.error("PresetDetailView: error loading approval history:", approvalHistoryError)
  }

  const isCurrentActive = capability?.current_preset === Number(presetId)
  const status = resolveEffectivePresetStatus(statusRow?.status, Number(presetId), capability?.current_preset) ?? "draft"

  const presetQuestions: PresetQuestion[] = (presetQuestionRows ?? [])
    .map((r) => {
      const q = Array.isArray(r.questions) ? r.questions[0] : r.questions
      return q as PresetQuestion | null
    })
    .filter((q): q is PresetQuestion => Boolean(q))

  return (
    <PresetDetailClient
      preset={preset}
      capabilityName={capability?.name ?? "Capability"}
      capabilityId={capabilityId}
      status={status}
      isCurrentActive={isCurrentActive}
      initialPresetQuestions={presetQuestions}
      allCapabilityQuestions={(capabilityQuestions as PresetQuestion[]) ?? []}
      approvalHistory={(approvalHistoryRows as unknown as ApprovalHistoryItem[]) ?? []}
      backHref={backHref}
      canManage={canManage}
    />
  )
}
