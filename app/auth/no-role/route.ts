import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"

// /protected sends signed-in users with no role here. A page can't clear
// cookies, so this route signs them out and shows the login page with an
// explanation -- sending them to /auth while still signed in would loop,
// since the proxy redirects signed-in users from /auth back to /protected.
export async function GET(request: NextRequest) {
  const supabase = createClient(await cookies())
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL("/auth/login?no_role=1", request.url))
}
