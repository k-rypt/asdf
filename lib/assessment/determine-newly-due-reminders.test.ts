import { describe, expect, it } from "vitest"
import { determineNewlyDueReminders } from "./determine-newly-due-reminders"

describe("determineNewlyDueReminders", () => {
  it("fires upcoming when not_yet and nothing has fired", () => {
    const result = determineNewlyDueReminders({
      state: "not_yet",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(),
      now: new Date("2026-10-15T00:00:00.000Z"),
    })
    expect(result).toEqual(["upcoming"])
  })

  it("fires nothing when not_yet and upcoming already fired", () => {
    const result = determineNewlyDueReminders({
      state: "not_yet",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(["upcoming"]),
      now: new Date("2026-10-15T00:00:00.000Z"),
    })
    expect(result).toEqual([])
  })

  it("fires only active_started when available with no effectiveUntil", () => {
    const result = determineNewlyDueReminders({
      state: "available",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: null,
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(),
      now: new Date("2026-11-02T00:00:00.000Z"),
    })
    expect(result).toEqual(["active_started"])
  })

  it("does not fire active_midpoint before the midpoint", () => {
    const result = determineNewlyDueReminders({
      state: "available",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(["active_started"]),
      now: new Date("2026-11-03T00:00:00.000Z"),
    })
    expect(result).toEqual([])
  })

  it("fires active_midpoint once now is at/after the midpoint", () => {
    // Window is 2026-11-01 to 2026-11-15 -- midpoint is 2026-11-08.
    const result = determineNewlyDueReminders({
      state: "available",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(["active_started"]),
      now: new Date("2026-11-08T00:00:00.000Z"),
    })
    expect(result).toEqual(["active_midpoint"])
  })

  it("fires active_due_soon within 24h of effectiveUntil", () => {
    const result = determineNewlyDueReminders({
      state: "available",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(["active_started", "active_midpoint"]),
      now: new Date("2026-11-14T12:00:00.000Z"),
    })
    expect(result).toEqual(["active_due_soon"])
  })

  it("fires nothing when every window type has already fired", () => {
    const result = determineNewlyDueReminders({
      state: "available",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(["active_started", "active_midpoint", "active_due_soon"]),
      now: new Date("2026-11-14T12:00:00.000Z"),
    })
    expect(result).toEqual([])
  })

  it("fires nothing when expired, regardless of prior firings", () => {
    const result = determineNewlyDueReminders({
      state: "expired",
      effectiveFrom: "2026-11-01T00:00:00.000Z",
      effectiveUntil: "2026-11-15T00:00:00.000Z",
      addedAt: "2026-10-01T00:00:00.000Z",
      alreadyFired: new Set(),
      now: new Date("2026-11-20T00:00:00.000Z"),
    })
    expect(result).toEqual([])
  })
})
