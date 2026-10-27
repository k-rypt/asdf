import Link from "next/link"
import { Button } from "@/components/ui/button"

/**
 * Full-page status message for the assessment route (not found, nothing
 * published, not yet open, window closed). This route has no sidebar --
 * see ../(portal)/layout.tsx -- so every dead-end state needs its own way
 * back to the dashboard.
 */
export function AssessmentMessage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{children}</p>
        <Button
          render={<Link href="/protected/employee" />}
          nativeButton={false}
          variant="outline"
          className="mt-4"
        >
          Back to dashboard
        </Button>
      </div>
    </main>
  )
}
