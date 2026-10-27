import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { inviteRedirectUrl, resolveSiteUrl } from "./site-url"

describe("resolveSiteUrl", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = original
  })

  it("falls back to the request origin when nothing is configured", () => {
    // Local dev depends on this: it yields http://localhost:3000 with no
    // configuration, which is what the dashboard allow-list holds.
    expect(resolveSiteUrl("http://localhost:3000/api/admin/users/invite")).toBe(
      "http://localhost:3000"
    )
  })

  it("prefers NEXT_PUBLIC_SITE_URL when set", () => {
    // Production: the request origin may be an internal or proxy host, which
    // the invited user must never be sent to.
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com"
    expect(resolveSiteUrl("http://10.0.0.5:3000/api/admin/users/invite")).toBe(
      "https://app.example.com"
    )
  })

  it("trims a trailing slash so the URL does not double up", () => {
    // `https://app.example.com//auth/set-password` would not match the
    // allow-list entry, and Supabase would silently fall back to Site URL.
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/"
    expect(resolveSiteUrl("http://localhost:3000/x")).toBe("https://app.example.com")
  })

  it("trims repeated trailing slashes and surrounding whitespace", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "  https://app.example.com///  "
    expect(resolveSiteUrl("http://localhost:3000/x")).toBe("https://app.example.com")
  })

  it("ignores a blank or whitespace-only value", () => {
    // An empty env var is easy to end up with (a key present with no value).
    // Treating it as configured would produce a relative redirectTo.
    process.env.NEXT_PUBLIC_SITE_URL = "   "
    expect(resolveSiteUrl("http://localhost:3000/x")).toBe("http://localhost:3000")
  })
})

describe("inviteRedirectUrl", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = original
  })

  it("points at the set-password page", () => {
    // This path is the one that must be allow-listed in Auth > URL
    // Configuration > Redirect URLs. Changing it here without changing the
    // dashboard setting makes invites land on the Site URL instead.
    expect(inviteRedirectUrl("http://localhost:3000/api/admin/users/invite")).toBe(
      "http://localhost:3000/auth/set-password"
    )
  })

  it("uses the configured origin when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/"
    expect(inviteRedirectUrl("http://localhost:3000/api/admin/users/invite")).toBe(
      "https://app.example.com/auth/set-password"
    )
  })
})
