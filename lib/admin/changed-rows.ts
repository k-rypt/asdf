import { NOT_YOUR_CAPABILITY } from "./capability-access"

/**
 * For browser updates/deletes made with `.select(...)`: row-level security
 * answers a refused update or delete with zero rows and no error, so treat
 * an empty result as refused. Only use it on writes that must change at
 * least one row -- e.g. not on clearing a preset's question list, which can
 * legitimately be empty.
 */
export function changedRows<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error(NOT_YOUR_CAPABILITY)
  return data
}
