import { cache } from "react"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"

// This function can be used in any server component to get the current user's role IDs.
// Wrapped in React's `cache` so that calling it multiple times in the same request 
// only triggers ONE database query.
export const getUserRoles = cache(async (userId: string) => {
  // 1. Get cookies required for Supabase to authenticate the server request
  const cookieStore = await cookies()
  
  // 2. Initialize the Supabase client using those cookies
  const supabase = createClient(cookieStore)
  
  // 3. Query the database
  const { data } = await supabase
    .from("profile_roles") // Query the junction/linking table
    .select("profile_role") // Fetch the role ID directly from this column
    .eq("profile_id", userId) // Filter for the specific user's ID

  // 4. Transform the data into a flat array of numbers
  return (data ?? [])
    // Extract the role ID directly from the row
    .map((row) => row.profile_role as number)
    // Filter out any null/undefined values to return a clean number array
    .filter((id): id is number => Boolean(id))
})
