  -- `public.assessments` has row level security enabled and already had an
  -- "Allow authenticated select" policy (confirmed by running this migration
  -- once and getting `policy "Allow authenticated select" for table
  -- "assessments" already exists` -- that statement has been removed below).
  -- What it's missing, unlike every other table in this feature area
  -- (questions, question_choices, assessment_questions, assessment_tiers --
  -- see the "Admin or capability owner can manage ..." policies in
  -- 2026-09-21_assessment_toolkit_schema.sql and
  -- 2026-09-21_assessment_toolkit_schema_03_yesno_ladder.sql), is any policy
  -- covering insert/update/delete. With RLS on and no write policy, every
  -- write is denied by default, which is exactly what surfaced as
  -- "new row violates row-level security policy for table \"assessments\""
  -- when testing app/api/admin/capabilities/[capability]/generate-assessment
  -- end to end as a capability-owner account.
  --
  -- (`assessments` predates this migrations folder -- like `capabilities`,
  -- `roles`, `profile_roles`, and `profile_capabilities`, it isn't created
  -- here, only referenced as a foreign-key target, so this migration can't
  -- verify what other policies already exist on it beyond what's been
  -- directly observed. If a policy with the name below already exists too,
  -- this migration will fail on `create policy` rather than silently
  -- duplicate it.)

  begin;

    alter table public.assessments enable row level security;

    -- Matches the exact admin/capability-owner write-gating already on
    -- questions/question_choices/assessment_questions/assessment_tiers
    -- (name-based join through profile_roles -> roles). Deliberately not
    -- scoped to "only your own capability" -- none of the sibling policies
    -- are scoped that way either.
    create policy "Admin or capability owner can manage assessments"
      on public.assessments for all
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
