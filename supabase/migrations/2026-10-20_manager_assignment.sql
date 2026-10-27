-- Manager assignment: assigning employees to a capability is a manager
-- function, not a capability-owner function.
-- Spec: docs/superpowers/specs/2026-10-20-manager-assignment-design.md
--
-- The three profile_capabilities write policies stop consulting
-- can_manage_capability(capability_id) entirely. After this, a capability
-- owner can no longer write an 'assessment' row even on a capability they
-- own -- they keep SELECT, but lose INSERT, UPDATE and DELETE. A manager may
-- write an 'assessment' row for ANY capability, but only for people in a
-- department they manage. Admins are unchanged and remain the only writers
-- of 'management' rows.
--
-- Reads are untouched: no select policy on any table changes here.
--
-- Run ONCE in the Supabase SQL Editor, then run
-- supabase/tests/2026-10-20_manager_assignment_check.sql.
-- Undo with 2026-10-20_manager_assignment_rollback.sql.

begin;

-- True when the caller manages a department that emp_id is an
-- assessment-taker in. Mirrors the shared-managed-department predicate in
-- lib/assessment/load-manager-rows.ts L12-27 -- keep the two in step.
--
-- `create function` (not `or replace`) so an existing function of the same
-- name stops the migration instead of being silently overwritten, matching
-- 2026-10-16_per_capability_permissions.sql's convention.
create function public.can_assign_employee(emp_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.profile_departments mgr
    join public.profile_departments emp
      on emp.department_id = mgr.department_id
     and emp.profile_id = emp_id
     and emp.status = 'assessment'
    where mgr.profile_id = auth.uid()
      and mgr.status = 'management'
  )
$$;

-- Who takes which capability.
--   Admin:   anything, including 'management' rows.
--   Manager: any capability, but only employees in a department they manage,
--            and never a 'management' row.
--   Owner:   no write at all -- can_manage_capability is gone from these
--            policies, so ownership grants nothing here.
drop policy if exists "Capability managers insert assignments" on public.profile_capabilities;
drop policy if exists "Capability managers update assignments" on public.profile_capabilities;
drop policy if exists "Capability managers delete assignments" on public.profile_capabilities;

create policy "Capability managers insert assignments" on public.profile_capabilities
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.can_assign_employee(profile_id)
      and assignment_type is distinct from 'management'
    )
  );

create policy "Capability managers update assignments" on public.profile_capabilities
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.can_assign_employee(profile_id)
      and assignment_type is distinct from 'management'
    )
  )
  with check (
    public.is_admin()
    or (
      public.can_assign_employee(profile_id)
      and assignment_type is distinct from 'management'
    )
  );

create policy "Capability managers delete assignments" on public.profile_capabilities
  for delete to authenticated
  using (
    public.is_admin()
    or (
      public.can_assign_employee(profile_id)
      and assignment_type is distinct from 'management'
    )
  );

commit;
