export interface AssessmentItem {
  id: number
  name: string
  status?: string | null
  capability_id?: number | null
  capability_name?: string | null
  duration_minutes?: number | null
  passing_score?: number | null
  created_at?: string | null
  // Schedule timestamps configured via Campaign Event Calendar
  available_from?: string | null
  available_until?: string | null
}

export interface DepartmentSummaryItem {
  id: number
  name: string
  memberCount: number
  completedCount?: number
  inProgressCount?: number
}

export interface AttemptItem {
  id: number
  assessment_id: number
  profile_id: string
  profile_name: string
  profile_email?: string
  status: string
  score?: number | null
  passed?: boolean | null
  created_at: string
  completed_at?: string | null
}

export interface AssessmentCampaign {
  id: number
  name: string
  description: string | null
  status: string
  created_at: string
  // Optional updated timestamp (fallback to created_at if null)
  updated_at?: string | null
  created_by?: string | null
  assessmentsCount: number
  assessments?: AssessmentItem[]
}

