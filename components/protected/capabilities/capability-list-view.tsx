import { createClient } from "@/supabase/server"
import { cookies } from "next/headers"

import { NewCapability } from "@/components/protected/admin/capabilities/menu/new_capability"
import { CapabilityCatalogue } from "@/components/protected/admin/capabilities/menu/capability_catalogue"

/**
 * Shared capability catalogue view, rendered under both
 * app/protected/admin/capabilities (any admin) and app/protected/capability
 * (capability owners). Capability owners don't get the "New Capability"
 * action -- creating a whole new capability is an admin-only action, unlike
 * generating an assessment draft for an existing one, which both roles can
 * do (see require-capability-admin-client.ts).
 */
export async function CapabilityListView({ 
  canCreate = false,
  ownerId 
}: { 
  canCreate?: boolean
  ownerId?: string 
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
  let query = supabase.from("capabilities").select("*")
  
  if (ownerId) {
    query = query.eq("owner_id", ownerId)
  }

  const { data: rawCapabilities } = await query

  // Enrich capabilities with relations for the catalogue cards
  const capabilities = await Promise.all((rawCapabilities ?? []).map(async (cap) => {
    const [
      { count: questionsCount },
      { count: presetsCount },
      { count: employeesCount },
      { data: presetData },
      { data: presetStatusData },
    ] = await Promise.all([
      supabase.from("questions").select("*", { count: "exact", head: true }).eq("capability_id", cap.id),
      supabase.from("question_presets").select("*", { count: "exact", head: true }).eq("capability_id", cap.id),
      supabase.from("profile_capabilities").select("*", { count: "exact", head: true })
        .eq("capability_id", cap.id)
        .neq("assignment_type", "management"),
      cap.current_preset 
        ? supabase.from("question_presets").select("name").eq("id", cap.current_preset).single() 
        : Promise.resolve({ data: null }),
      cap.current_preset
        ? supabase.from("preset_current_status").select("status").eq("preset_id", cap.current_preset).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    let presetQuestionsCount = 0;
    if (cap.current_preset) {
        const { count } = await supabase.from("question_preset_questions").select("*", { count: "exact", head: true }).eq("preset_id", cap.current_preset);
        presetQuestionsCount = count || 0;
    }

    return {
      ...cap,
      questionsCount: questionsCount || 0,
      presetsCount: presetsCount || 0,
      employeesCount: employeesCount || 0,
      presetName: presetData?.name || null,
      presetStatus: presetStatusData?.status || null,
      presetQuestionsCount
    }
  }))

  return (
    <main className="flex justify-center min-h-svh w-full">
      <div className="w-full max-w-6xl mt-5 flex flex-col p-4 lg:p-0">
        <header className="flex justify-between w-full mb-2">
          <h1 className="text-2xl font-bold tracking-tight">Your Capabilities</h1>
          {canCreate && <NewCapability />}
        </header>
        <div>
          <CapabilityCatalogue capabilities={capabilities} canEdit={canCreate} />
        </div>
      </div>
    </main>
  )
}
