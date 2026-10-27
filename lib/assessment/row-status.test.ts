import { describe, expect, it } from "vitest"
import { rowStatusFor } from "./row-status"

const completed = { kind: "finished", attemptId: 1, status: "completed", finishedAt: "2026-10-15T01:20:00Z" } as const
const invalidated = { kind: "finished", attemptId: 1, status: "invalidated", finishedAt: "2026-10-15T01:05:00Z" } as const

describe("rowStatusFor", () => {
  it("shows a completed attempt as completed, even past the window or flagged overdue", () => {
    expect(rowStatusFor(completed, { overdue: true, windowState: "expired" })).toBe("completed")
  })

  it("shows an invalidated attempt as closed, not active or missed", () => {
    expect(rowStatusFor(invalidated, { overdue: false, windowState: "available" })).toBe("closed")
    expect(rowStatusFor(invalidated, { overdue: true, windowState: "expired" })).toBe("closed")
  })

  it("shows no attempt as overdue once flagged or past the window", () => {
    expect(rowStatusFor({ kind: "start" }, { overdue: true, windowState: "available" })).toBe("overdue")
    expect(rowStatusFor({ kind: "start" }, { overdue: false, windowState: "expired" })).toBe("overdue")
  })

  it("shows no attempt before the window as not yet open", () => {
    expect(rowStatusFor({ kind: "start" }, { overdue: false, windowState: "not_yet" })).toBe("not_yet_open")
  })

  it("shows in progress and not started inside the window", () => {
    expect(rowStatusFor({ kind: "resume", attemptId: 1 }, { overdue: false, windowState: "available" })).toBe("in_progress")
    expect(rowStatusFor({ kind: "start" }, { overdue: false, windowState: "available" })).toBe("not_started")
  })
})
