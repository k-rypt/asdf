"use client"

import { type FormEvent, useState } from "react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function InvitationForm({className, ...props}: React.ComponentProps<"form">) {
  // Not wired up yet -- inviting goes through InviteUserDialog. Until then,
  // stop the browser submitting the fields as a GET query string.
  const [error] = useState<string | null>(null)
  const [isLoading] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <form
      className={cn("flex flex-col gap-6 max-w-md", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-start gap-1 text-center">
          <p className="text-sm text-balance text-muted-foreground">
            Enter your target user&apos;s credential
          </p>
        </div>
        <div className="flex gap-4">
            {/* First or Given Name - required */}
            <Field>
            <FieldLabel htmlFor="name">Given Name</FieldLabel>
            <Input
                id="name"
                name="name"
                type="text"
                placeholder="Juan"
                required
                disabled={isLoading}
            />
            </Field>
            {/* Last Name - required */}
            <Field>
            <FieldLabel htmlFor="name">Last Name</FieldLabel>
            <Input
                id="name"
                name="name"
                type="text"
                placeholder="Dela Cruz"
                required
                disabled={isLoading}
            />
            </Field>
            {/* Email - required */}
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="email_123@example.com"
            required
            disabled={isLoading}
          />
        </Field>
        {/* Last Name - required */}
        <Field>
          <FieldLabel htmlFor="job-title">Job Title</FieldLabel>
          <Input
            id="job-title"
            name="job-title"
            type="text"
            placeholder="Web Developer"
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
        <FieldSeparator>Or continue with</FieldSeparator>
        <Field>
          <Button variant="outline" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path
                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                fill="currentColor"
              />
            </svg>
            Login with GitHub
          </Button>
          <FieldDescription className="text-center">
            Don&apos;t have an account?{" "}
            <a href="#" className="underline underline-offset-4">
              Sign up
            </a>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
