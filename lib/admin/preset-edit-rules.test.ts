import { describe, it, expect } from "vitest"
import {
  deletePresetBlockedReason,
  editPresetBlockedReason,
  submitPresetBlockedReason,
  withdrawsOnEdit,
} from "./preset-edit-rules"

describe("preset-edit-rules", () => {
  describe("editPresetBlockedReason", () => {
    it("locks approved presets", () => {
      expect(editPresetBlockedReason("approved")).toMatch(/approved/i)
    })

    it("lets draft, rejected and pending presets be edited", () => {
      expect(editPresetBlockedReason(null)).toBeNull()
      expect(editPresetBlockedReason("draft")).toBeNull()
      expect(editPresetBlockedReason("rejected")).toBeNull()
      expect(editPresetBlockedReason("pending_approval")).toBeNull()
    })
  })

  describe("withdrawsOnEdit", () => {
    it("withdraws only a pending request", () => {
      expect(withdrawsOnEdit("pending_approval")).toBe(true)
      expect(withdrawsOnEdit("draft")).toBe(false)
      expect(withdrawsOnEdit("rejected")).toBe(false)
      expect(withdrawsOnEdit(null)).toBe(false)
    })
  })

  describe("deletePresetBlockedReason", () => {
    it("blocks deleting the active preset", () => {
      expect(deletePresetBlockedReason(5, 5)).toMatch(/active/i)
    })

    it("allows deleting any preset that isn't active, approved or not", () => {
      expect(deletePresetBlockedReason(5, 6)).toBeNull()
      expect(deletePresetBlockedReason(5, null)).toBeNull()
    })
  })

  describe("submitPresetBlockedReason", () => {
    it("only sends the active preset for approval", () => {
      expect(submitPresetBlockedReason("draft", 5, 6)).toMatch(/active/i)
      expect(submitPresetBlockedReason("draft", 5, null)).toMatch(/active/i)
    })

    it("allows an active draft or rejected preset", () => {
      expect(submitPresetBlockedReason(null, 5, 5)).toBeNull()
      expect(submitPresetBlockedReason("draft", 5, 5)).toBeNull()
      expect(submitPresetBlockedReason("rejected", 5, 5)).toBeNull()
    })

    it("refuses a preset that is already pending or approved", () => {
      expect(submitPresetBlockedReason("pending_approval", 5, 5)).toMatch(/already/i)
      expect(submitPresetBlockedReason("approved", 5, 5)).toMatch(/already/i)
    })
  })
})
