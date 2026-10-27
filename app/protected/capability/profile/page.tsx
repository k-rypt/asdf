import Link from "next/link"

import { getUser } from "@/lib/get-user"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

export default async function ProfilePage() {
  const user = await getUser()

  // Layout already redirects unauthenticated users; this is just a safety net.
  if (!user) {
    return null
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ?? "Username"
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16 rounded-lg">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="rounded-lg">
            {displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">User ID</dt>
        <dd className="font-mono">{user.id}</dd>

        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email}</dd>

        <dt className="text-muted-foreground">Last sign in</dt>
        <dd>
          {user.last_sign_in_at
            ? new Date(user.last_sign_in_at).toLocaleString()
            : "—"}
        </dd>
      </dl>

      <Button
        render={<Link href="/protected/capability" />}
        nativeButton={false}
        variant="outline"
        className="w-fit"
      >
        Back to Capabilities
      </Button>
    </main>
  )
}
