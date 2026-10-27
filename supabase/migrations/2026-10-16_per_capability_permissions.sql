-- Per-capability permissions.
-- Spec: docs/superpowers/specs/2026-10-16-per-capability-permissions-design.md
--
-- A capability owner may change only the capabilities they own; admins may
-- change everything. Reads are untouched. Run ONCE in the Supabase SQL
-- Editor, then run supabase/tests/2026-10-16_per_capability_permissions_check.sql.
-- Undo with 2026-10-16_per_capability_permissions_rollback.sql.

begin;

-- 1. Snapshot every current policy on the affected tables. The rollback
-- script recreates them from this exactly. RLS on, no policies: only the
-- service role and the SQL Editor can read it.
create table public._policy_backup_20261016 as
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'questions', 'question_choices', 'question_presets', 'question_preset_questions',
    'preset_approvals', 'assessments', 'assessment_questions', 'assessment_tiers',
    'assessment_deadline_flags', 'profile_capabilities', 'capabilities'
  ]);
alter table public._policy_backup_20261016 enable row level security;

-- 2. Helpers. security definer so they can read profile_roles/capabilities
-- whatever those tables' own policies say; they only ever return a value.
-- `create function` (not `or replace`) so an existing function of the same
-- name stops the migration instead of being silently overwritten.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profile_roles
    where profile_id = auth.uid() and profile_role = 1
  )
$$;

-- Admin, or this capability's owner who still holds the capability-owner
-- role (removing the role cuts access even if owner_id still names them).
create function public.can_manage_capability(cap_id bigint) returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.capabilities c
    join public.profile_roles pr on pr.profile_id = c.owner_id and pr.profile_role = 3
    where c.id = cap_id and c.owner_id = auth.uid()
  )
$$;

create function public.question_capability_id(q_id uuid) returns bigint
language sql stable security definer set search_path = public
as $$ select capability_id from public.questions where id = q_id $$;

create function public.preset_capability_id(p_id bigint) returns bigint
language sql stable security definer set search_path = public
as $$ select capability_id from public.question_presets where id = p_id $$;

create function public.assessment_capability_id(a_id bigint) returns bigint
language sql stable security definer set search_path = public
as $$ select capability_id from public.assessments where id = a_id $$;

revoke all on function
  public.is_admin(), public.can_manage_capability(bigint), public.question_capability_id(uuid),
  public.preset_capability_id(bigint), public.assessment_capability_id(bigint)
from public;
grant execute on function
  public.is_admin(), public.can_manage_capability(bigint), public.question_capability_id(uuid),
  public.preset_capability_id(bigint), public.assessment_capability_id(bigint)
to authenticated;

-- 3. Drop every PERMISSIVE write policy on these tables (restrictive
-- policies, e.g. the approved-preset lock, stay and still AND in). A
-- `for all` policy also grants select, so keep its condition as a
-- select-only copy first -- reads stay exactly as they were.
do $$
declare p record;
begin
  for p in select * from public._policy_backup_20261016
           where cmd <> 'SELECT' and permissive = 'PERMISSIVE' loop
    if p.cmd = 'ALL' and p.qual is not null then
      execute format(
        'create policy %I on public.%I for select to %s using (%s)',
        left('read: ' || p.policyname, 63), p.tablename, array_to_string(p.roles, ', '), p.qual
      );
    end if;
    raise notice 'Replacing policy "%" on %', p.policyname, p.tablename;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 4. New write policies.

-- Tables that carry capability_id directly.
create policy "Capability managers insert questions" on public.questions
  for insert to authenticated with check (public.can_manage_capability(capability_id));
create policy "Capability managers update questions" on public.questions
  for update to authenticated
  using (public.can_manage_capability(capability_id))
  with check (public.can_manage_capability(capability_id));
create policy "Capability managers delete questions" on public.questions
  for delete to authenticated using (public.can_manage_capability(capability_id));

create policy "Capability managers insert presets" on public.question_presets
  for insert to authenticated with check (public.can_manage_capability(capability_id));
create policy "Capability managers update presets" on public.question_presets
  for update to authenticated
  using (public.can_manage_capability(capability_id))
  with check (public.can_manage_capability(capability_id));
create policy "Capability managers delete presets" on public.question_presets
  for delete to authenticated using (public.can_manage_capability(capability_id));

-- Owners can draft; only admins publish or archive.
create policy "Capability managers insert assessments" on public.assessments
  for insert to authenticated
  with check (
    public.can_manage_capability(capability_id)
    and (status not in ('published', 'archived') or public.is_admin())
  );
-- Owners can't touch published/archived rows either (deleting cascades to employee results).
create policy "Capability managers update assessments" on public.assessments
  for update to authenticated
  using (
    public.can_manage_capability(capability_id)
    and (status not in ('published', 'archived') or public.is_admin())
  )
  with check (
    public.can_manage_capability(capability_id)
    and (status not in ('published', 'archived') or public.is_admin())
  );
create policy "Capability managers delete assessments" on public.assessments
  for delete to authenticated using (
    public.can_manage_capability(capability_id)
    and (status not in ('published', 'archived') or public.is_admin())
  );

-- Children of a question.
create policy "Capability managers insert choices" on public.question_choices
  for insert to authenticated
  with check (public.can_manage_capability(public.question_capability_id(question_id)));
create policy "Capability managers update choices" on public.question_choices
  for update to authenticated
  using (public.can_manage_capability(public.question_capability_id(question_id)))
  with check (public.can_manage_capability(public.question_capability_id(question_id)));
create policy "Capability managers delete choices" on public.question_choices
  for delete to authenticated
  using (public.can_manage_capability(public.question_capability_id(question_id)));

-- Children of a preset.
create policy "Capability managers insert preset questions" on public.question_preset_questions
  for insert to authenticated
  with check (public.can_manage_capability(public.preset_capability_id(preset_id)));
create policy "Capability managers update preset questions" on public.question_preset_questions
  for update to authenticated
  using (public.can_manage_capability(public.preset_capability_id(preset_id)))
  with check (public.can_manage_capability(public.preset_capability_id(preset_id)));
create policy "Capability managers delete preset questions" on public.question_preset_questions
  for delete to authenticated
  using (public.can_manage_capability(public.preset_capability_id(preset_id)));

-- Owners may only submit; decisions and history edits are admin-only.
-- (Deleting a preset still removes its history: FK cascades skip RLS.)
create policy "Capability managers record submissions" on public.preset_approvals
  for insert to authenticated
  with check (
    public.can_manage_capability(public.preset_capability_id(preset_id))
    and (action = 'submitted' or public.is_admin())
  );
create policy "Admins update approvals" on public.preset_approvals
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete approvals" on public.preset_approvals
  for delete to authenticated using (public.is_admin());

-- Children of an assessment.
create policy "Capability managers insert assessment questions" on public.assessment_questions
  for insert to authenticated
  with check (public.can_manage_capability(public.assessment_capability_id(assessment_id)));
create policy "Capability managers update assessment questions" on public.assessment_questions
  for update to authenticated
  using (public.can_manage_capability(public.assessment_capability_id(assessment_id)))
  with check (public.can_manage_capability(public.assessment_capability_id(assessment_id)));
create policy "Capability managers delete assessment questions" on public.assessment_questions
  for delete to authenticated
  using (public.can_manage_capability(public.assessment_capability_id(assessment_id)));

create policy "Capability managers insert tiers" on public.assessment_tiers
  for insert to authenticated
  with check (public.can_manage_capability(public.assessment_capability_id(assessment_id)));
create policy "Capability managers update tiers" on public.assessment_tiers
  for update to authenticated
  using (public.can_manage_capability(public.assessment_capability_id(assessment_id)))
  with check (public.can_manage_capability(public.assessment_capability_id(assessment_id)));
create policy "Capability managers delete tiers" on public.assessment_tiers
  for delete to authenticated
  using (public.can_manage_capability(public.assessment_capability_id(assessment_id)));

-- Deadline flags: the capability's managers, or the profile's department
-- manager (unchanged from 2026-09-29_assessment_deadline_flags.sql).
create policy "Capability or department managers write deadline flags" on public.assessment_deadline_flags
  for insert to authenticated
  with check (
    public.can_manage_capability(public.assessment_capability_id(assessment_id))
    or exists (
      select 1 from profile_departments pd
      where pd.profile_id = (select auth.uid())
        and pd.status = 'management'
        and pd.department_id in (
          select department_id from profile_departments
          where profile_id = assessment_deadline_flags.profile_id
        )
    )
  );

-- Who takes which capability. Owners can't create 'management' rows.
create policy "Capability managers insert assignments" on public.profile_capabilities
  for insert to authenticated
  with check (
    public.can_manage_capability(capability_id)
    and (assignment_type is distinct from 'management' or public.is_admin())
  );
create policy "Capability managers update assignments" on public.profile_capabilities
  for update to authenticated
  using (
    public.can_manage_capability(capability_id)
    and (assignment_type is distinct from 'management' or public.is_admin())
  )
  with check (
    public.can_manage_capability(capability_id)
    and (assignment_type is distinct from 'management' or public.is_admin())
  );
create policy "Capability managers delete assignments" on public.profile_capabilities
  for delete to authenticated using (
    public.can_manage_capability(capability_id)
    and (assignment_type is distinct from 'management' or public.is_admin())
  );

-- Capabilities: create/delete stay admin-only; owners may update their own
-- row, limited to the description by the trigger below.
create policy "Admins create capabilities" on public.capabilities
  for insert to authenticated with check (public.is_admin());
create policy "Admins delete capabilities" on public.capabilities
  for delete to authenticated using (public.is_admin());
create policy "Capability managers update capabilities" on public.capabilities
  for update to authenticated
  using (public.can_manage_capability(id))
  with check (public.can_manage_capability(id));

-- 5. A policy can't compare old and new values, so a trigger limits
-- non-admins to the description. No auth.uid() means the service role or
-- the SQL Editor (e.g. invite setting owner_id) -- let those through.
create function public.capabilities_owner_edit_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'description') is distinct from (to_jsonb(old) - 'description') then
    raise exception 'Capability owners can only change the description.'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger capabilities_owner_edit_guard
  before update on public.capabilities
  for each row execute function public.capabilities_owner_edit_guard();

commit;
