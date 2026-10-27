import { describe, expect, it } from "vitest"
import { archiveAccount, reactivateAccount, type AccountDeps } from "./archive-account"

function fakeDeps(overrides: Partial<AccountDeps> = {}) {
  const calls: string[] = []
  const deps: AccountDeps = {
    ban: async (id) => {
      calls.push(`ban:${id}`)
    },
    unban: async (id) => {
      calls.push(`unban:${id}`)
    },
    closeInProgressAttempts: async (id) => {
      calls.push(`close:${id}`)
      return [41, 42]
    },
    setStatus: async (id, status) => {
      calls.push(`status:${id}:${status}`)
    },
    ...overrides,
  }
  return { deps, calls }
}

describe("archiveAccount", () => {
  it("bans, closes attempts, then sets inactive, in that order", async () => {
    const { deps, calls } = fakeDeps()
    const result = await archiveAccount(deps, "emp-1")
    expect(calls).toEqual(["ban:emp-1", "close:emp-1", "status:emp-1:inactive"])
    expect(result).toEqual({ closedAttemptIds: [41, 42] })
  })

  it("changes nothing else if the ban fails", async () => {
    const { deps, calls } = fakeDeps({
      ban: async () => {
        throw new Error("auth down")
      },
    })
    await expect(archiveAccount(deps, "emp-1")).rejects.toThrow("auth down")
    expect(calls).toEqual([])
  })

  it("lifts the ban if closing attempts fails", async () => {
    const { deps, calls } = fakeDeps()
    deps.closeInProgressAttempts = async (id) => {
      calls.push(`close:${id}`)
      throw new Error("db down")
    }
    await expect(archiveAccount(deps, "emp-1")).rejects.toThrow("db down")
    expect(calls).toEqual(["ban:emp-1", "close:emp-1", "unban:emp-1"])
  })

  it("lifts the ban if setting the status fails", async () => {
    const { deps, calls } = fakeDeps()
    deps.setStatus = async (id, status) => {
      calls.push(`status:${id}:${status}`)
      throw new Error("db down")
    }
    await expect(archiveAccount(deps, "emp-1")).rejects.toThrow("db down")
    expect(calls).toEqual(["ban:emp-1", "close:emp-1", "status:emp-1:inactive", "unban:emp-1"])
  })

  it("still rethrows the original error if lifting the ban also fails", async () => {
    const { deps } = fakeDeps({
      closeInProgressAttempts: async () => {
        throw new Error("db down")
      },
      unban: async () => {
        throw new Error("auth down")
      },
    })
    await expect(archiveAccount(deps, "emp-1")).rejects.toThrow("db down")
  })
})

describe("reactivateAccount", () => {
  it("unbans, then sets active, and never touches attempts", async () => {
    const { deps, calls } = fakeDeps()
    await reactivateAccount(deps, "emp-1")
    expect(calls).toEqual(["unban:emp-1", "status:emp-1:active"])
  })

  it("leaves the status unchanged if the unban fails", async () => {
    const { deps, calls } = fakeDeps({
      unban: async () => {
        throw new Error("auth down")
      },
    })
    await expect(reactivateAccount(deps, "emp-1")).rejects.toThrow("auth down")
    expect(calls).toEqual([])
  })
})
