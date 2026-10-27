import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { syncOwnerAssignment } from "./owner-assignment-sync"

/**
 * These tests cover the decision logic of syncOwnerAssignment -- which of
 * delete/insert/do-nothing happens for a given (new owner, previous owner,
 * existing row) combination. That branching is what keeps
 * capabilities.owner_id and the owner's 'management' row from drifting, so
 * it is worth pinning down: getting it wrong either strands a stale row on
 * a former owner or silently deletes an employee's assessment assignment.
 *
 * The fake below implements only the query chains the helper actually uses
 * (delete().eq().eq(), select().eq().eq().maybeSingle(), insert()), so it
 * stays readable. It records every operation so the assertions can talk
 * about what was done, not just what was returned.
 */

interface FakeState {
  /** Rows are (profile_id, capability_id, assignment_type). */
  rows: { profile_id: string; capability_id: number; assignment_type: string }[]
  /** Every mutation, in order, for assertions. */
  ops: string[]
  /** Force an error on the next matching operation. */
  failOn?: "delete" | "insert" | "select"
}

function makeFakeClient(state: FakeState): SupabaseClient {
  const failIf = (kind: NonNullable<FakeState["failOn"]>) =>
    state.failOn === kind ? { message: `${kind} blew up` } : null

  // A chainable stub. Each builder returns itself so .eq()/.in() can chain,
  // and is also thenable so `await` works without an explicit .execute().
  function makeChain(op: { type: string; filters: [string, unknown][]; payload?: unknown }) {
    const chain: Record<string, unknown> = {}

    const resolve = () => {
      const forced = failIf(op.type as NonNullable<FakeState["failOn"]>)
      if (forced) return { data: null, error: forced, count: null }

      const matches = (r: { profile_id: string; capability_id: number; assignment_type: string }) =>
        op.filters.every(([col, val]) => (r as unknown as Record<string, unknown>)[col] === val)

      if (op.type === "select") {
        const found = state.rows.filter(matches)
        return { data: found.length > 0 ? found[0] : null, error: null, count: null }
      }
      if (op.type === "delete") {
        const before = state.rows.length
        state.rows = state.rows.filter((r) => !matches(r))
        state.ops.push(`delete:${op.filters.map(([c, v]) => `${c}=${v}`).join(",")}`)
        return { data: null, error: null, count: before - state.rows.length }
      }
      if (op.type === "insert") {
        const row = op.payload as { profile_id: string; capability_id: number; assignment_type: string }
        state.rows.push(row)
        state.ops.push(`insert:${row.profile_id}:${row.capability_id}:${row.assignment_type}`)
        return { data: null, error: null, count: 1 }
      }
      return { data: null, error: null, count: null }
    }

    chain.eq = (col: string, val: unknown) => {
      op.filters.push([col, val])
      return chain
    }
    chain.in = () => chain
    chain.maybeSingle = () => Promise.resolve(resolve())
    chain.single = () => Promise.resolve(resolve())
    chain.select = () => chain
    // Thenable: `await chain` resolves like a PostgREST builder would.
    chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
    return chain
  }

  return {
    from: (table: string) => {
      expect(table).toBe("profile_capabilities")
      return {
        delete: () => makeChain({ type: "delete", filters: [] }),
        select: () => makeChain({ type: "select", filters: [] }),
        insert: (payload: unknown) => makeChain({ type: "insert", filters: [], payload }),
      }
    },
  } as unknown as SupabaseClient
}

function newState(overrides: Partial<FakeState> = {}): FakeState {
  return { rows: [], ops: [], ...overrides }
}

describe("syncOwnerAssignment", () => {
  describe("setting an owner", () => {
    it("inserts a 'management' row when the person has no row yet", async () => {
      const state = newState()
      const result = await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b")

      expect(result.error).toBeUndefined()
      expect(state.rows).toHaveLength(1)
      expect(state.rows[0]).toMatchObject({
        profile_id: "owner-b",
        capability_id: 7,
        assignment_type: "management",
      })
    })

    it("leaves an existing 'assessment' row alone (the PK allows only one row)", async () => {
      const state = newState({
        rows: [{ profile_id: "owner-b", capability_id: 7, assignment_type: "assessment" }],
      })
      const result = await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b")

      expect(result.error).toBeUndefined()
      expect(state.rows).toEqual([
        { profile_id: "owner-b", capability_id: 7, assignment_type: "assessment" },
      ])
      expect(state.ops).toEqual([])
    })

    it("does not duplicate a 'management' row the person already has", async () => {
      const state = newState({
        rows: [{ profile_id: "owner-b", capability_id: 7, assignment_type: "management" }],
      })
      await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b")

      expect(state.rows).toHaveLength(1)
      expect(state.ops).toEqual([])
    })
  })

  describe("switching owners", () => {
    it("removes the outgoing owner's 'management' row", async () => {
      const state = newState({
        rows: [{ profile_id: "owner-a", capability_id: 7, assignment_type: "management" }],
      })
      await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b", "owner-a")

      // A's stale row is gone, B's is present.
      expect(state.rows).toHaveLength(1)
      expect(state.rows[0]).toMatchObject({
        profile_id: "owner-b",
        capability_id: 7,
        assignment_type: "management",
      })
    })

    it("keeps the outgoing owner's 'assessment' row (they are still an employee)", async () => {
      const state = newState({
        rows: [{ profile_id: "owner-a", capability_id: 7, assignment_type: "assessment" }],
      })
      await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b", "owner-a")

      expect(state.rows).toContainEqual({
        profile_id: "owner-a",
        capability_id: 7,
        assignment_type: "assessment",
      })
    })

    it("does not delete anything when the owner is unchanged (A -> A)", async () => {
      const state = newState({
        rows: [{ profile_id: "owner-a", capability_id: 7, assignment_type: "management" }],
      })
      await syncOwnerAssignment(makeFakeClient(state), 7, "owner-a", "owner-a")

      expect(state.rows).toEqual([
        { profile_id: "owner-a", capability_id: 7, assignment_type: "management" },
      ])
    })
  })

  describe("clearing an owner", () => {
    it("removes every 'management' row for the capability", async () => {
      const state = newState({
        rows: [
          { profile_id: "owner-a", capability_id: 7, assignment_type: "management" },
          { profile_id: "owner-a", capability_id: 7, assignment_type: "assessment" },
          { profile_id: "emp-c", capability_id: 7, assignment_type: "assessment" },
          { profile_id: "owner-a", capability_id: 8, assignment_type: "management" },
        ],
      })
      await syncOwnerAssignment(makeFakeClient(state), 7, null)

      // Only capability 7's management row went; the employee rows and the
      // other capability are untouched.
      expect(state.rows).toEqual([
        { profile_id: "owner-a", capability_id: 7, assignment_type: "assessment" },
        { profile_id: "emp-c", capability_id: 7, assignment_type: "assessment" },
        { profile_id: "owner-a", capability_id: 8, assignment_type: "management" },
      ])
    })
  })

  describe("failures are reported, never thrown", () => {
    it("returns a message when the insert fails", async () => {
      const state = newState({ failOn: "insert" })
      const result = await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b")

      expect(result.error).toContain("assignment was not recorded")
    })

    it("returns a message when the clearing delete fails", async () => {
      const state = newState({ failOn: "delete" })
      const result = await syncOwnerAssignment(makeFakeClient(state), 7, null)

      expect(result.error).toContain("Could not clear")
    })

    it("returns a message when the existing-row check fails", async () => {
      const state = newState({ failOn: "select" })
      const result = await syncOwnerAssignment(makeFakeClient(state), 7, "owner-b")

      expect(result.error).toContain("Could not check existing assignments")
    })
  })
})
