// app/auth/confirm/route.ts
import { type EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/auth/set-password"

  if (token_hash && type) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      // verifyOtp sets the session cookie via createClient's cookie
      // handlers — the person is now authenticated for exactly long
      // enough to set a password on the next page.
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Bad, expired, or reused token
  return NextResponse.redirect(new URL("/auth/error", request.url))
}