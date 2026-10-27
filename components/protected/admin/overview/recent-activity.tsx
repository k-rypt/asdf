import Link from "next/link"
import { CircleCheck, Send, ThumbsUp, ThumbsDown, CalendarCheck, UserPlus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ActivityEvent, ActivityKind } from "@/lib/admin/overview-activity"

const KIND_ICON: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  completed: { icon: CircleCheck, tone: "text-emerald-600" },
  submitted: { icon: Send, tone: "text-sky-600" },
  approved: { icon: ThumbsUp, tone: "text-emerald-600" },
  rejected: { icon: ThumbsDown, tone: "text-destructive" },
  opened: { icon: CalendarCheck, tone: "text-violet-600" },
  joined: { icon: UserPlus, tone: "text-muted-foreground" },
}

function timeAgo(at: string, now: number): string {
  const minutes = Math.round((now - new Date(at).getTime()) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(at))
}

export function RecentActivity({ events, now }: { events: ActivityEvent[]; now: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Completions, preset decisions, assessments opening and new users.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {events.map((e) => {
              const { icon: Icon, tone } = KIND_ICON[e.kind]
              const body = (
                <>
                  <Icon className={`size-4 shrink-0 ${tone}`} />
                  <p className="min-w-0 flex-1 truncate text-sm">{e.text}</p>
                  <time dateTime={e.at} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {timeAgo(e.at, now)}
                  </time>
                </>
              )
              return (
                <li key={e.key}>
                  {e.href ? (
                    <Link href={e.href} className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/50">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 p-3">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
