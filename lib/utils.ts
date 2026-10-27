export { cn } from "cn"

/**
 * Converts an ISO date string (like Supabase's timestamptz) into a human-readable format.
 * @param dateString The date string to format (e.g., "2026-09-25T13:50:26.123Z")
 * @param includeTime Whether to include the time in the output (e.g., "Sep 25, 2026, 1:50 PM")
 * @returns Formatted date string
 */
export function formatDate(dateString: string | null | undefined, includeTime: boolean = false): string {
  if (!dateString) return "N/A"
  
  const date = new Date(dateString)
  
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime && {
      hour: "numeric",
      minute: "numeric",
    })
  }

  return date.toLocaleDateString("en-US", options)
}
