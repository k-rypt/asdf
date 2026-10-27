import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { activatePendingAccount } from "./activate-on-sign-in"

/** Records the update and its filters; implements only update().eq().eq(). */
function makeFakeClient(error: { message: string } | null = null) {
  const calls: { table?: string; values?: unknown; filters: [string, unknown][] } = { filters: [] }
  const chain = {
    eq(column: string, value: unknown) {
      calls.filters.push([column, value])
      return calls.filters.length === 2 ? Promise.resolve({ error }) : chain
    },
  }
  const client = {
    from(table: string) {
      calls.table = table
      return {
        update(values: unknown) {
          calls.values = values
          return chain
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe("activatePendingAccount", () => {
  it("only moves this person's profile from pending to active", async () => {
    const { client, calls } = makeFakeClient()
    await activatePendingAccount(client, "user-1")
    expect(calls).toEqual({
      table: "profiles",
      values: { status: "active" },
      filters: [
        ["id", "user-1"],
        ["status", "pending"],
      ],
    })
  })

  it("logs instead of throwing when the update fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { client } = makeFakeClient({ message: "boom" })
    await expect(activatePendingAccount(client, "user-1")).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith("Couldn't activate pending account user-1: boom")
    log.mockRestore()
  })
})
