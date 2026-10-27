import { NextResponse } from "next/server"

/** Shared error-to-response mapping for the app/api/assessments|questions|compile|submissions route handlers. */
export function toErrorResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : "Unexpected error."
  // Without this, a failing route left nothing in the server log -- the
  // only trace was the JSON body the browser received.
  if (status >= 500) console.error("API route error:", err)
  return NextResponse.json({ error: message }, { status })
}
