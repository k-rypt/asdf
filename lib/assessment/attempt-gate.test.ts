import { describe, expect, it } from "vitest"
import { attemptGate, isLiveAttempt } from "./attempt-gate"

const attempt = (id: number, status: string, createdAt: string, completedAt: string | null = null) => ({
  id,
  status,
  created_at: createdAt,
  started_at: createdAt,
  completed_at: completedAt,
})

describe("attemptGate", () => {
  it("starts when there are no attempts", () => {
    expect(attemptGate([])).toEqual({ kind: "start" })
  })

  it("resumes an attempt that is in progress", () => {
    expect(attemptGate([attempt(5, "in_progress", "2026-10-15T01:00:00Z")])).toEqual({ kind: "resume", attemptId: 5 })
  })

  it("blocks after a completed attempt", () => {
    expect(attemptGate([attempt(5, "completed", "2026-10-15T01:00:00Z", "2026-10-15T01:20:00Z")])).toEqual({
      kind: "finished",
      attemptId: 5,
      status: "completed",
      finishedAt: "2026-10-15T01:20:00Z",
    })
  })

  it("blocks after an invalidated attempt", () => {
    expect(attemptGate([attempt(5, "invalidated", "2026-10-15T01:00:00Z", "2026-10-15T01:05:00Z")])).toEqual({
      kind: "finished",
      attemptId: 5,
      status: "invalidated",
      finishedAt: "2026-10-15T01:05:00Z",
    })
  })

  it("resumes an in-progress attempt even if an older one is finished", () => {
    expect(
      attemptGate([
        attempt(4, "completed", "2026-10-14T01:00:00Z", "2026-10-14T01:20:00Z"),
        attempt(5, "in_progress", "2026-10-15T01:00:00Z"),
      ])
    ).toEqual({ kind: "resume", attemptId: 5 })
  })

  it("reports the earliest finished attempt when there are several", () => {
    expect(
      attemptGate([
        attempt(7, "completed", "2026-10-15T01:00:00Z", "2026-10-15T01:20:00Z"),
        attempt(3, "invalidated", "2026-10-13T01:00:00Z", "2026-10-13T01:05:00Z"),
      ])
    ).toEqual({ kind: "finished", attemptId: 3, status: "invalidated", finishedAt: "2026-10-13T01:05:00Z" })
  })

  describe("with a time limit", () => {
    const limit = (now: string) => ({ durationMinutes: 25, now: new Date(now).getTime() })

    it("resumes an in-progress attempt that still has time", () => {
      expect(attemptGate([attempt(5, "in_progress", "2026-10-15T01:00:00Z")], limit("2026-10-15T01:24:00Z"))).toEqual({
        kind: "resume",
        attemptId: 5,
      })
    })

    it("treats an in-progress attempt whose time ran out as finished, ending at its deadline", () => {
      expect(attemptGate([attempt(5, "in_progress", "2026-10-15T01:00:00Z")], limit("2026-10-15T01:34:00Z"))).toEqual({
        kind: "finished",
        attemptId: 5,
        status: "invalidated",
        finishedAt: "2026-10-15T01:25:00.000Z",
        timeExpired: true,
      })
    })

    it("still reports an earlier completed attempt over a later expired one", () => {
      expect(
        attemptGate(
          [
            attempt(4, "completed", "2026-10-14T01:00:00Z", "2026-10-14T01:20:00Z"),
            attempt(5, "in_progress", "2026-10-15T01:00:00Z"),
          ],
          limit("2026-10-15T01:34:00Z")
        )
      ).toEqual({ kind: "finished", attemptId: 4, status: "completed", finishedAt: "2026-10-14T01:20:00Z" })
    })

    it("has no deadline when the assessment has no duration", () => {
      expect(
        attemptGate([attempt(5, "in_progress", "2026-10-15T01:00:00Z")], {
          durationMinutes: null,
          now: new Date("2026-10-20T00:00:00Z").getTime(),
        })
      ).toEqual({ kind: "resume", attemptId: 5 })
    })
  })
})

describe("isLiveAttempt", () => {
  const now = new Date("2026-10-15T01:20:00Z").getTime()

  it("is live while in progress with time left", () => {
    expect(isLiveAttempt(attempt(5, "in_progress", "2026-10-15T01:00:00Z"), { durationMinutes: 25, now })).toBe(true)
  })

  it("is not live once its time has run out", () => {
    expect(isLiveAttempt(attempt(5, "in_progress", "2026-10-15T01:00:00Z"), { durationMinutes: 15, now })).toBe(false)
  })

  it("is live with no time limit", () => {
    expect(isLiveAttempt(attempt(5, "in_progress", "2026-10-15T01:00:00Z"), { durationMinutes: null, now })).toBe(true)
  })

  it("is not live once finished", () => {
    expect(isLiveAttempt(attempt(5, "completed", "2026-10-15T01:00:00Z"), { durationMinutes: 25, now })).toBe(false)
  })
})
