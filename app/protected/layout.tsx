// app/protected/layout.tsx
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/get-user'
import { activatePendingAccount } from '@/lib/auth/activate-on-sign-in'
import { getServiceRoleClient } from '@/lib/supabase/service-role-client'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Every sign-in lands under /protected, so this is the first-sign-in hook.
  // Service role: the status column is admin-managed, not the user's to write.
  await activatePendingAccount(getServiceRoleClient(), user.id)

  return <>{children}</>
}