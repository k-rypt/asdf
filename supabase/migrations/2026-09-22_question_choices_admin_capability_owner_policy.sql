-- Same gap as 2026-09-22_assessments_admin_capability_owner_policy.sql, this
-- time on `public.question_choices`: RLS is enabled with only a pre-existing
-- "Allow authenticated select" policy (per the comment on
-- 2026-09-21_assessment_toolkit_schema.sql:192-194, which names
-- questions/question_choices/profile_roles as already having that style of
-- policy from before this migrations folder existed) and no insert/update/
-- delete policy. `questions` itself already allows writes (confirmed live --
-- the questions insert in generate-assessment succeeds), so only
-- `question_choices` needs this. Surfaced end-to-end as
-- "new row violates row-level security policy for table \"question_choices\""
-- when generateAssessmentFromJobDescription tried to insert options for a
-- multiple_choice question.
--
-- (`question_choices` predates this migrations folder too, so -- same caveat
-- as assessments -- this can't verify what other policies already exist on
-- it beyond what's been directly observed.)

begin;

  alter table public.question_choices enable row level security;

  -- Matches the exact admin/capability-owner write-gating already on
  -- questions/assessment_questions/assessment_tiers/assessments
  -- (name-based join through profile_roles -> roles).
  create policy "Admin or capability owner can manage question choices"
    on public.question_choices for all
    to authenticated
    using (
      exists (
        select 1 from profile_roles pr
        join roles r on pr.profile_role = r.id
        where pr.profile_id = (select auth.uid())
          and r.name = any (array['admin', 'capability owner'])
      )
    )
    with check (
      exists (
        select 1 from profile_roles pr
        join roles r on pr.profile_role = r.id
        where pr.profile_id = (select auth.uid())
          and r.name = any (array['admin', 'capability owner'])
      )
    );

commit;
