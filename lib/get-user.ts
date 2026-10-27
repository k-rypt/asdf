import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"

// This function can be used in any server component to get the current user.
export const getUser = cache(async () => {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  
  return user
})