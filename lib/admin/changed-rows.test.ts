import { describe, expect, it } from "vitest"
import { changedRows } from "./changed-rows"

describe("changedRows", () => {
  it("returns the rows a write changed", () => {
    expect(changedRows({ data: [{ id: 1 }], error: null })).toEqual([{ id: 1 }])
  })

  it("treats zero changed rows as refused -- that's how the database reports it", () => {
    expect(() => changedRows({ data: [], error: null })).toThrow("You can only change capabilities you own.")
    expect(() => changedRows({ data: null, error: null })).toThrow("You can only change capabilities you own.")
  })

  it("passes a database error through", () => {
    expect(() => changedRows({ data: null, error: { message: "boom" } })).toThrow("boom")
  })
})
