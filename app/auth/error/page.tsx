import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

/**
 * Where a failed email-link verification lands.
 *
 * app/auth/confirm/route.ts redirects here when a token is missing,
 * expired, already used, or invalid. Until now that redirect 404'd, so an
 * invited user clicking a stale link saw a bare "not found" with no hint
 * that the link itself was the problem or what to do about it.
 *
 * The most common cause by far is reusing a link: invite and recovery
 * tokens are single-use, so opening the same message twice fails the
 * second time even though nothing is wrong with the account. That is why
 * the copy leads with it instead of assuming something is broken.
 *
 * Deliberately reachable while signed out, and never redirected by the
 * proxy (supabase/proxy.ts only guards /protected).
 */
export default function AuthErrorPage() {
  return (
    <div className="grid min-h-svh">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            RSACT
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>This link is no longer valid</CardTitle>
              <CardDescription>
                The link could not be confirmed. It may have expired, or it may
                already have been used.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Sign-in links can only be used once. If you have already opened
                this one, your account may be ready — try signing in with the
                password you set.
              </p>
              <p className="text-sm text-muted-foreground">
                Still stuck? Ask your administrator to send a new invitation.
              </p>
              <Link href="/auth/login" className={cn(buttonVariants(), "w-full")}>
                Go to sign in
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
