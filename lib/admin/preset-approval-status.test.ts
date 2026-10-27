import { describe, it, expect } from "vitest"
import {
  resolveEffectivePresetStatus,
  isPendingApprovalActive,
} from "./preset-approval-status"

describe("preset-approval-status", () => {
  describe("resolveEffectivePresetStatus", () => {
    it("returns null if rawStatus is null or empty", () => {
      expect(resolveEffectivePresetStatus(null, 1, 1)).toBeNull()
      expect(resolveEffectivePresetStatus(undefined, 1, 1)).toBeNull()
    })

    it("retains approved or rejected status regardless of current_preset", () => {
      expect(resolveEffectivePresetStatus("approved", 1, 1)).toBe("approved")
      expect(resolveEffectivePresetStatus("approved", 1, null)).toBe("approved")
      expect(resolveEffectivePresetStatus("approved", 1, 2)).toBe("approved")

      expect(resolveEffectivePresetStatus("rejected", 1, 1)).toBe("rejected")
      expect(resolveEffectivePresetStatus("rejected", 1, null)).toBe("rejected")
      expect(resolveEffectivePresetStatus("rejected", 1, 2)).toBe("rejected")
    })

    it("keeps pending_approval if preset matches current_preset", () => {
      expect(resolveEffectivePresetStatus("pending_approval", 10, 10)).toBe("pending_approval")
    })

    it("reverts pending_approval to null when removed as active (current_preset is null)", () => {
      expect(resolveEffectivePresetStatus("pending_approval", 10, null)).toBeNull()
      expect(resolveEffectivePresetStatus("pending_approval", 10, undefined)).toBeNull()
    })

    it("reverts pending_approval to null when a different preset is active", () => {
      expect(resolveEffectivePresetStatus("pending_approval", 10, 20)).toBeNull()
    })
  })

  describe("isPendingApprovalActive", () => {
    it("returns true only when preset is the current_preset and pending approval", () => {
      expect(isPendingApprovalActive(10, 10, "pending_approval")).toBe(true)
      expect(isPendingApprovalActive(10, 10)).toBe(true)
    })

    it("returns false if preset is no longer active", () => {
      expect(isPendingApprovalActive(10, null, "pending_approval")).toBe(false)
      expect(isPendingApprovalActive(10, 20, "pending_approval")).toBe(false)
    })

    it("returns false if rawStatus is not pending_approval", () => {
      expect(isPendingApprovalActive(10, 10, "approved")).toBe(false)
      expect(isPendingApprovalActive(10, 10, "rejected")).toBe(false)
    })
  })
})
