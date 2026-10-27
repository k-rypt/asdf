-- Two things bundled here since they land on the same tables at the same
-- time: (1) columns Part 2/3 need (admin_note, source_preset_id) added
-- now so this migration doesn't have to be split further, and (2) the
-- question_presets write policy, which is needed as soon as Task 5's
-- create-preset route tries to insert into it.
--
-- `question_presets` predates the migrations folder (like `assessments`
-- did before 2026-09-22_assessments_admin_capability_owner_policy.sql) --
-- RLS is very likely already enabled with only a select policy, same as
-- every other pre-existing table in this feature area turned out to have.
-- Adding the write policy proactively here rather than waiting to hit
-- "new row violates row-level security policy" live, since that's now a
-- confirmed pattern across assessments/questions/question_choices.
--
-- `assessments.status` is a plain text column (see
-- 2026-09-21_assessment_toolkit_schema.sql Step 2), not an enum, so no
-- `alter type ... add value` dance is needed for the new
-- 'pending_approval' / 'rejected' status values the app will start writing
-- in Part 2 -- they're just strings, no migration required for them.

begin;

alter table public.assessments
  add column if not exists admin_note text,
  add column if not exists source_preset_id bigint references public.question_presets(id) on delete set null;

create unique index if not exists assessments_one_published_per_capability
  on public.assessments (capability_id)
  where status = 'published';

create policy "Admin or capability owner can manage question presets"
  on public.question_presets for all
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
