-- Task 1's preset_approvals.created_by referenced auth.users(id), which
-- PostgREST cannot traverse to embed public.profiles -- every other
-- "who did this" column in the schema (assessment_questions.profile_id,
-- assessments.created_by, notifications.profile_id) references
-- public.profiles(id) instead. Task 8's approval-history query
-- (`.select("...,profiles(given_name, last_name)")`) depends on a direct
-- FK to public.profiles to resolve the embed.
begin;

alter table public.preset_approvals
  drop constraint preset_approvals_created_by_fkey,
  add constraint preset_approvals_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

commit;
