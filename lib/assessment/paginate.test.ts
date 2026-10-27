import { describe, expect, it } from "vitest"
import { chunk, fetchAllPages } from "./paginate"

describe("chunk", () => {
  it("splits an array into chunks of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("returns one chunk when the array is smaller than the chunk size", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })

  it("returns an empty array for an empty input", () => {
    expect(chunk([], 10)).toEqual([])
  })

  it("returns exactly-sized chunks when the array length is a multiple of the chunk size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it("throws for a non-positive chunk size", () => {
    expect(() => chunk([1, 2], 0)).toThrow()
    expect(() => chunk([1, 2], -1)).toThrow()
  })
})

describe("fetchAllPages", () => {
  it("returns everything from a single page smaller than the page size", async () => {
    const result = await fetchAllPages(async (from, to) => {
      expect(from).toBe(0)
      expect(to).toBe(2)
      return ["a", "b"]
    }, 3)
    expect(result).toEqual(["a", "b"])
  })

  it("keeps requesting pages until one comes back short of the page size", async () => {
    const pages = [["a", "b"], ["c", "d"], ["e"]]
    let calls = 0
    const result = await fetchAllPages(async (from, to) => {
      expect(to - from + 1).toBe(2)
      const page = pages[calls]
      calls += 1
      return page
    }, 2)
    expect(result).toEqual(["a", "b", "c", "d", "e"])
    expect(calls).toBe(3)
  })

  it("stops immediately when the first page is empty", async () => {
    let calls = 0
    const result = await fetchAllPages(async () => {
      calls += 1
      return []
    }, 1000)
    expect(result).toEqual([])
    expect(calls).toBe(1)
  })

  it("fetches one more page to confirm no data remains when a page lands exactly on pageSize", async () => {
    let calls = 0
    const result = await fetchAllPages(async (from) => {
      calls += 1
      return from === 0 ? ["a", "b"] : []
    }, 2)
    // A page exactly equal to pageSize is ambiguous (could be the last page
    // landing on a boundary); fetchAllPages must request the next page to
    // find out, rather than assume more data remains.
    expect(result).toEqual(["a", "b"])
    expect(calls).toBe(2)
  })
})
