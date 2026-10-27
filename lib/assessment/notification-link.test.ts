import { describe, expect, it } from "vitest"
import { linkForNotification } from "./notification-link"

describe("linkForNotification", () => {
  it("sends attempt_completed through the review redirect, which picks the reviewer's page", () => {
    const link = linkForNotification({
      type: "attempt_completed",
      assessment_id: 11,
      attempt_id: 42,
      completer_profile_id: "abc-123",
    })
    expect(link).toBe("/protected/review-attempt/42")
  })

  it("returns null for attempt_completed when attempt_id is missing", () => {
    const link = linkForNotification({
      type: "attempt_completed",
      assessment_id: 11,
      attempt_id: null,
      completer_profile_id: "abc-123",
    })
    expect(link).toBeNull()
  })

  it("builds the employee assessment link from assessment_id for window-type reminders", () => {
    const link = linkForNotification({
      type: "active_due_soon",
      assessment_id: 7,
      attempt_id: null,
      completer_profile_id: null,
    })
    expect(link).toBe("/protected/employee/assessment/7")
  })

  it("returns null for window-type reminders when assessment_id is missing", () => {
    const link = linkForNotification({
      type: "upcoming",
      assessment_id: null,
      attempt_id: null,
      completer_profile_id: null,
    })
    expect(link).toBeNull()
  })

  it("builds the capability presets-tab link for preset_approved", () => {
    const href = linkForNotification({
      type: "preset_approved",
      assessment_id: null,
      attempt_id: null,
      completer_profile_id: null,
      capability_id: 9,
    })
    expect(href).toBe("/protected/capability/9?tab=presets")
  })

  it("builds the capability presets-tab link for preset_rejected", () => {
    const href = linkForNotification({
      type: "preset_rejected",
      assessment_id: null,
      attempt_id: null,
      completer_profile_id: null,
      capability_id: 9,
    })
    expect(href).toBe("/protected/capability/9?tab=presets")
  })

  it("returns null for preset decisions when capability_id is missing", () => {
    const href = linkForNotification({
      type: "preset_approved",
      assessment_id: null,
      attempt_id: null,
      completer_profile_id: null,
      capability_id: null,
    })
    expect(href).toBeNull()
  })
})
