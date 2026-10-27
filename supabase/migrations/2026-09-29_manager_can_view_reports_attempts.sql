-- Fix for a final-review finding on the assessment-availability-window
-- plan: managers had no SELECT policy on public.attempts at all (only
-- "own rows" and "admin or capability owner" existed -- see
-- 2026-09-21_assessment_toolkit_schema.sql), so app/protected/manager/
-- page.tsx's attempts query returned zero rows for every manager. That
-- silently broke two things: every report showed "Not started" instead
-- of their real status, and flagOverdueAssessments (lib/assessment/
-- deadline-flags.ts) treated every expired candidate as having no
-- completed attempt, permanently flagging completed employees as
-- overdue (the flags table is write-once, on conflict do nothing).
--
-- This mirrors the manager-shared-department check already used by
-- assessment_deadline_flags's policies (2026-09-29_assessment_deadline_
-- flags.sql) rather than inventing a new shape.

begin;

drop policy if exists "Manager can view direct reports' attempts" on public.attempts;

create policy "Manager can view direct reports' attempts"
  on public.attempts for select
  to authenticated
  using (
    exists (
      select 1 from profile_departments pd
      where pd.profile_id = auth.uid()
        and pd.status = 'management'
        and pd.department_id in (
          select department_id from profile_departments
          where profile_id = attempts.profile_id
        )
    )
  );

commit;
