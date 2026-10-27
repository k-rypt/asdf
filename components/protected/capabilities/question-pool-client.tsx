"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CustomizePresetDialog } from "./customize-preset-dialog"
import { isKindDisabled, toQuestionKind, trimToFirstKindGroup } from "@/lib/assessment/ladder"

export interface PoolQuestion {
  id: string
  type: string
  title: string
  sfiaLevel: number | null
  createdAt: string
}

type SortOrder = "newest" | "oldest" | "title"

// Base UI's <SelectValue> renders the selected item's raw `value` unless
// the root is told how to map it to a label -- without this, the closed
// trigger shows e.g. "newest" instead of "Newest".
const SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title" },
]

export function QuestionPoolClient({
  capabilityId,
  backHref,
  questions,
}: {
  capabilityId: string
  backHref: string
  questions: PoolQuestion[]
}) {
  const searchParams = useSearchParams()
  // A preset never mixes ladder and graded questions, so a mixed preselect keeps only the first question's group.
  const preselect = useMemo(
    () =>
      new Set(
        trimToFirstKindGroup(
          (searchParams.get("preselect") ?? "").split(",").filter(Boolean),
          new Map(questions.map((q) => [q.id, q.type]))
        )
      ),
    [searchParams, questions]
  )

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest")
  const [selected, setSelected] = useState<Set<string>>(preselect)
  const [dialogOpen, setDialogOpen] = useState(false)

  const selectedKinds = useMemo(
    () => new Set(questions.filter((q) => selected.has(q.id)).map((q) => toQuestionKind(q.type))),
    [questions, selected]
  )

  const types = useMemo(() => Array.from(new Set(questions.map((q) => q.type))), [questions])

  // Same Base UI <SelectValue> label-resolution requirement as
  // SORT_ORDER_OPTIONS above, but built from the dynamic `types` list.
  const typeFilterOptions = useMemo(
    () => [{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t.replace("_", " ") }))],
    [types]
  )

  const visible = useMemo(() => {
    let list = questions
    if (typeFilter !== "all") list = list.filter((q) => q.type === typeFilter)
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      list = list.filter((q) => q.title.toLowerCase().includes(needle))
    }
    const sorted = [...list]
    if (sortOrder === "newest") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (sortOrder === "oldest") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    if (sortOrder === "title") sorted.sort((a, b) => a.title.localeCompare(b.title))
    return sorted
  }, [questions, typeFilter, search, sortOrder])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6 pb-24">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Capability
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Question pool</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every active question for this capability. Select a set to build a preset.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")} items={typeFilterOptions}>
          <SelectTrigger className="w-40">
            <SelectValue className="capitalize" />
          </SelectTrigger>
          <SelectContent>
            {typeFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="capitalize">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={(v) => setSortOrder((v ?? "newest") as SortOrder)} items={SORT_ORDER_OPTIONS}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_ORDER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        {visible.map((q) => {
          const isSelected = selected.has(q.id)
          const kind = toQuestionKind(q.type)
          const disabled = !isSelected && isKindDisabled(selectedKinds, kind)
          return (
            <Card key={q.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <Checkbox checked={isSelected} disabled={disabled} onCheckedChange={() => toggle(q.id)} />
                <div className="flex-1">
                  <p className={disabled ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium"}>{q.title}</p>
                </div>
                <Badge variant="outline" className="capitalize text-xs">{q.type.replace("_", " ")}</Badge>
                {disabled && (
                  <span className="text-xs text-muted-foreground">
                    {kind === "yes_no" ? "Can't be mixed with graded questions" : "Can't be mixed with the ladder"}
                  </span>
                )}
                {q.sfiaLevel != null && <Badge variant="outline" className="text-xs">SFIA {q.sfiaLevel}</Badge>}
              </CardContent>
            </Card>
          )
        })}
        {visible.length === 0 && (
          <p className="text-center text-muted-foreground text-sm p-8">
            No active questions match this filter.
          </p>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 flex justify-end">
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          <Button disabled={selected.size === 0} onClick={() => setDialogOpen(true)}>
            Make Preset
          </Button>
        </div>
      </div>

      <CustomizePresetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        capabilityId={capabilityId}
        questionIds={Array.from(selected)}
        onSaved={() => setDialogOpen(false)}
      />
    </div>
  )
}
