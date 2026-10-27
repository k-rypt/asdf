/**
 * Row shapes for the department detail page's members query
 * (app/protected/admin/departments/[department]/page.tsx). To-one embeds
 * can arrive as an object or a one-element array, so `profile` allows both.
 */
export interface CapabilityLink {
  capabilities: { name: string } | null
}

export interface DepartmentProfile {
  id: string
  given_name: string | null
  last_name: string | null
  email: string | null
  job_title: string | null
  profile_capabilities?: CapabilityLink[] | null
}

export interface DepartmentMember {
  profile_id: string
  status: string
  added_at: string | null
  profile: DepartmentProfile | DepartmentProfile[] | null
  adder: { given_name: string | null; last_name: string | null } | null
}

export interface DepartmentOption {
  id: string | number
  name: string
  status: string
}

/** Message from a caught error, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
