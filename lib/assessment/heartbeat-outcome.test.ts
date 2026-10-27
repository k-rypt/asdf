import { describe, expect, it } from "vitest"
import { heartbeatOutcome } from "./heartbeat-outcome"

const startedAt = "2026-10-15T03:44:31.000Z"
const at = (seconds: number) => new Date(startedAt).getTime() + seconds * 1000

describe("heartbeatOutcome", () => {
  it("reports time left on an in-progress attempt", () => {
    expect(heartbeatOutcome({ status: "in_progress", startedAt, durationMinutes: 25 }, at(90))).toEqual({
      success: true,
      expired: false,
      timeLeft: 25 * 60 - 90,
    })
  })

  it("expires an in-progress attempt once its time is up", () => {
    expect(heartbeatOutcome({ status: "in_progress", startedAt, durationMinutes: 25 }, at(25 * 60 + 1))).toEqual({
      success: false,
      expired: true,
      timeLeft: 0,
    })
  })

  it("does not expire an attempt that was just completed (completeSession still running)", () => {
    expect(heartbeatOutcome({ status: "completed", startedAt, durationMinutes: 25 }, at(90))).toEqual({
      success: true,
    })
  })

  it("expires an attempt that was invalidated elsewhere (e.g. the account was archived)", () => {
    expect(heartbeatOutcome({ status: "invalidated", startedAt, durationMinutes: 25 }, at(90))).toEqual({
      success: false,
      expired: true,
    })
  })

  it("expires when the attempt can't be found", () => {
    expect(heartbeatOutcome(null, at(90))).toEqual({ success: false, expired: true })
  })

  it("has no countdown when the assessment has no duration", () => {
    expect(heartbeatOutcome({ status: "in_progress", startedAt, durationMinutes: null }, at(90))).toEqual({
      success: true,
    })
  })
})
