/**
 * Splits `items` into arrays of at most `size` elements each, preserving
 * order. Used both to keep PostgREST `.in()` filter lists short enough to
 * avoid URL-length limits, and to bound insert batch size so one
 * conflicting row can't abort an entire multi-row insert (Postgres aborts
 * the whole statement on the first constraint violation it hits).
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error(`chunk size must be positive, got ${size}`)
  }
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

/**
 * Repeatedly calls `fetchPage(from, to)` (an inclusive 0-based range, the
 * same shape PostgREST's `.range()` takes) until a page comes back with
 * fewer than `pageSize` rows, then returns every row fetched. Hosted
 * Supabase's PostgREST caps unpaginated responses at 1000 rows by default
 * -- any `.select()` that can plausibly return more than that needs this,
 * or it silently truncates instead of erroring.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const page = await fetchPage(from, from + pageSize - 1)
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}
