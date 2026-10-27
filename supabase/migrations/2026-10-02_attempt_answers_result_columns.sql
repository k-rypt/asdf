-- Widens attempt_answers with the SubmissionResult fields it has never
-- persisted (display_level, display_level_description, feedback,
-- chain_of_thought, annotated_code, guides -- see
-- lib/assessment/supabase-assessment-api-client.ts's submitAnswer, which
-- already builds all of these per question type but only ever persisted
-- raw_answer/time_spent/the four score_* columns). Needed for two things
-- that share this exact gap: reconstructing a resumed attempt's prior
-- answers with full fidelity, and the new Manager/Capability-Owner
-- Finished-assessment detail view. questionTitle is deliberately NOT
-- snapshotted here -- it's re-joined live from questions.title at read
-- time, consistent with how the rest of the app treats question text.
--
-- Also adds the one RLS gap this plan's detail view exposes: attempts
-- already has a manager-scoped SELECT policy
-- (2026-09-29_manager_can_view_reports_attempts.sql), but attempt_answers
-- never got the equivalent -- a manager loading the new detail view would
-- see the attempt row but zero answer rows under it. This mirrors that
-- policy's shape exactly, joined through attempt_id instead of a direct
-- profile_id column.

begin;

alter table public.attempt_answers
  add column if not exists display_level text;

alter table public.attempt_answers
  add column if not exists display_level_description text;

alter table public.attempt_answers
  add column if not exists feedback text;

alter table public.attempt_answers
  add column if not exists chain_of_thought text;

alter table public.attempt_answers
  add column if not exists annotated_code jsonb;

alter table public.attempt_answers
  add column if not exists guides jsonb;

drop policy if exists "Manager can view direct reports' attempt answers" on public.attempt_answers;

create policy "Manager can view direct reports' attempt answers"
  on public.attempt_answers for select
  to authenticated
  using (
    exists (
      select 1 from public.attempts a
      join profile_departments pd on pd.profile_id = auth.uid()
      where a.id = attempt_answers.attempt_id
        and pd.status = 'management'
        and pd.department_id in (
          select department_id from profile_departments
          where profile_id = a.profile_id
        )
    )
  );

commit;
