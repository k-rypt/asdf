import { describe, expect, it } from "vitest"
import { canAssignEmployee, canManageCapability, NOT_YOUR_CAPABILITY, NOT_YOUR_EMPLOYEE } from "./capability-access"
describe("canManageCapability", () => {
  it("lets an admin manage any capability, owned or not", () => {
    expect(canManageCapability({ roleNames: ["admin"], userId: "u1", ownerId: "someone-else" })).toBe(true)
    expect(canManageCapability({ roleNames: ["admin"], userId: "u1", ownerId: null })).toBe(true)
  })

  it("lets a capability owner manage the capability they own", () => {
    expect(canManageCapability({ roleNames: ["capability owner"], userId: "u1", ownerId: "u1" })).toBe(true)
  })

  it("refuses a capability owner on someone else's capability", () => {
    expect(canManageCapability({ roleNames: ["capability owner"], userId: "u1", ownerId: "u2" })).toBe(false)
  })

  it("refuses a capability owner on a capability with no owner", () => {
    expect(canManageCapability({ roleNames: ["capability owner"], userId: "u1", ownerId: null })).toBe(false)
  })

  it("refuses someone named as owner who no longer has the capability-owner role", () => {
    expect(canManageCapability({ roleNames: ["employee"], userId: "u1", ownerId: "u1" })).toBe(false)
  })

  it("treats someone with both roles as an admin", () => {
    expect(canManageCapability({ roleNames: ["admin", "capability owner"], userId: "u1", ownerId: "u2" })).toBe(true)
  })

  it("exposes the refusal message used across the app", () => {
    expect(NOT_YOUR_CAPABILITY).toBe("You can only change capabilities you own.")
  })
})

describe("canAssignEmployee", () => {
  it("lets an admin assign anyone", () => {
    expect(canAssignEmployee({ roleNames: ["admin"], isManager: false })).toBe(true)
  })

  it("lets a manager assign within a department they manage", () => {
    expect(canAssignEmployee({ roleNames: ["manager"], isManager: true })).toBe(true)
  })

  it("refuses a manager assigning outside their departments", () => {
    expect(canAssignEmployee({ roleNames: ["manager"], isManager: false })).toBe(false)
  })

  it("refuses a capability owner: ownership grants no assignment right", () => {
    expect(canAssignEmployee({ roleNames: ["capability owner"], isManager: false })).toBe(false)
  })

  it("allows an owner who is also a manager, because they are a manager", () => {
    expect(canAssignEmployee({ roleNames: ["capability owner", "manager"], isManager: true })).toBe(true)
  })

  it("refuses an employee", () => {
    expect(canAssignEmployee({ roleNames: ["employee"], isManager: false })).toBe(false)
  })

  it("exposes a refusal message pointing at a manager", () => {
    expect(NOT_YOUR_EMPLOYEE).toContain("manager")
  })
})
