import { LoginForm } from "@/components/landing/login-form"
import Link from "next/link"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { archived, no_role } = await searchParams

  return (
    <div className="grid min-h-svh">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            RSACT
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm archived={archived === "1"} noRole={no_role === "1"} />
          </div>
        </div>
      </div>
    </div>
  )
}
