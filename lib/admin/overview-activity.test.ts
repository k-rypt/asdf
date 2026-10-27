import { describe, expect, it } from "vitest"
import { recentActivity, weeklyCompletions, weeksWindowStart, type ActivityEvent } from "./overview-activity"

// Thursday 16 Oct 2026, local time.
const now = new Date(2026, 9, 16, 15, 0)

describe("weeklyCompletions", () => {
  it("returns one bucket per week ending with the current week, zeros kept", () => {
    const weeks = weeklyCompletions([], 3, now)
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"])
    expect(weeks.every((w) => w.completed === 0)).toBe(true)
    expect(weeks[2].label).toBe("Oct 12")
  })

  it("counts Monday through Sunday into the same week", () => {
    const weeks = weeklyCompletions(
      [
        new Date(2026, 9, 12, 0, 1).toISOString(), // Mon
        new Date(2026, 9, 16, 9).toISOString(), // Thu
        new Date(2026, 9, 11, 23, 59).toISOString(), // previous Sun
      ],
      2,
      now
    )
    expect(weeks.map((w) => w.completed)).toEqual([1, 2])
  })

  it("ignores completions outside the window", () => {
    const weeks = weeklyCompletions([new Date(2026, 0, 1).toISOString()], 2, now)
    expect(weeks.map((w) => w.completed)).toEqual([0, 0])
  })

  it("window start is the first bucket's Monday at midnight", () => {
    expect(weeksWindowStart(3, now)).toEqual(new Date(2026, 8, 28))
  })
})

describe("recentActivity", () => {
  const ev = (key: string, at: Date): ActivityEvent => ({ key, kind: "completed", at: at.toISOString(), text: key, href: null })

  it("merges sources newest first and caps the list", () => {
    const list = recentActivity(
      [ev("a", new Date(2026, 9, 1)), ev("b", new Date(2026, 9, 15)), ev("c", new Date(2026, 9, 10))],
      2,
      now
    )
    expect(list.map((e) => e.key)).toEqual(["b", "c"])
  })

  it("drops events dated in the future", () => {
    const list = recentActivity([ev("later", new Date(2026, 9, 20)), ev("past", new Date(2026, 9, 1))], 10, now)
    expect(list.map((e) => e.key)).toEqual(["past"])
  })
})
