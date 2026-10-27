import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"
import { QuestionPoolClient, type PoolQuestion } from "./question-pool-client"

/**
 * Lists every `active` question for a capability -- the full bank, not one
 * batch. Only `active` questions ever appear here: this is the
 * enforcement point for "presets are only ever built from reviewed,
 * active questions" (pending_review questions never show up in this list).
 */
export async function QuestionPoolView({
  capabilityId,
  backHref,
}: {
  capabilityId: string
  backHref: string
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data } = await supabase
    .from("questions")
    .select("id, type, title, sfia_level, created_at")
    .eq("capability_id", capabilityId)
    .eq("status", "active")
    .order("created_at", { ascending: false })

  const questions: PoolQuestion[] = (data ?? []).map((q) => ({
    id: q.id,
    type: q.type,
    title: q.title,
    sfiaLevel: q.sfia_level,
    createdAt: q.created_at,
  }))

  return <QuestionPoolClient capabilityId={capabilityId} backHref={backHref} questions={questions} />
}
