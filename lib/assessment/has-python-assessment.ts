import "server-only"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"

/**
 * Whether any published assessment on the employee's capabilities has an
 * active Python code question -- if so, the employee portal prefetches the
 * Pyodide runtime so Run Code is ready before the assessment timer starts.
 * Errors count as "no": prefetching is only an optimisation.
 */
export async function hasPythonAssessment(profileId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: capabilityRows } = await supabase
    .from("profile_capabilities")
    .select("capability_id")
    .eq("profile_id", profileId)
  const capabilityIds = (capabilityRows ?? []).map((row) => row.capability_id as number)
  if (capabilityIds.length === 0) return false

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id")
    .in("capability_id", capabilityIds)
    .eq("status", "published")
  const assessmentIds = (assessments ?? []).map((row) => row.id as number)
  if (assessmentIds.length === 0) return false

  const { data: pythonQuestions } = await supabase
    .from("assessment_questions")
    .select("question_id, questions!inner(type, language, status)")
    .in("assessment_id", assessmentIds)
    .eq("questions.type", "code_snippet")
    .eq("questions.language", "python")
    .eq("questions.status", "active")
    .limit(1)
  return (pythonQuestions ?? []).length > 0
}
