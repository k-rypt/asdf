"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/supabase/client"

const ARCHIVED_MESSAGE = "This account has been archived. Contact your administrator."
const NO_ROLE_MESSAGE = "This account has no role assigned yet. Contact your administrator."

export function LoginForm({
  className,
  archived = false,
  noRole = false,
  ...props
}: React.ComponentProps<"form"> & { archived?: boolean; noRole?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(
    archived ? ARCHIVED_MESSAGE : noRole ? NO_ROLE_MESSAGE : null
  )
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    const formData = new FormData(event.currentTarget)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    })

    if (signInError) {
      setError(signInError.code === "user_banned" ? ARCHIVED_MESSAGE : signInError.message)
      setIsLoading(false)
      return
    }

    // Delegate role-based routing to the server (/protected/page.tsx).
    // No router.refresh(): /protected is dynamic, so this already fetches
    // fresh, and a refresh alongside it doubled every login's request.
    router.replace("/protected")
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Login to your account</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email below to login to your account
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            disabled={isLoading}
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </a>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            disabled={isLoading}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
        <Field>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
