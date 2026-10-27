-- Verifies 2026-10-20_manager_assignment.sql: assigning employees to a
-- capability is a manager function, not a capability-owner function.
--
-- Run the whole file in the Supabase SQL Editor, AFTER applying
-- 2026-10-20_manager_assignment.sql. It creates throwaway test data,
-- impersonates users, and rolls everything back. Success = one row saying
-- all checks passed. A failure stops at the first FAIL message.
--
-- Companion to 2026-10-16_per_capability_permissions_check.sql, which now
-- asserts the owner side (an owner can no longer write an assignment at all).
-- This file asserts the manager side.
--
-- NOTE ON THE PK: profile_capabilities has a primary key on
-- (profile_id, capability_id) -- one row per person per capability, whatever
-- the assignment_type. The invite route documents this at
-- app/api/admin/users/invite/route.ts L164-165. Every check below therefore
-- uses its OWN capability id. Sharing one capability across checks would make
-- a later insert collide on the PK, and would make the "allowed" checks pass
-- vacuously (the row already exists, so the insert is a no-op and RLS is
-- never exercised). Do not consolidate these capabilities.

begin;

-- ── Setup (as the SQL Editor's role; RLS doesn't apply here) ──────────
-- t.mgr    a manager who is also an assessment-taker (both statuses in D1),
--          so the "manager assigns themselves" case is testable.
-- t.puremgr a manager with NO assessment row (cannot assign themselves).
-- t.emp_in  an assessment-taker in the manager's department (assignable).
-- t.emp_out an assessment-taker in a different department (not assignable).
-- t.cap1..cap6 one fresh capability per allowed-path check (see PK note).
select set_config('t.admin', coalesce((
  select profile_id::text from public.profile_roles where profile_role = 1 limit 1), ''), true);

do $$
declare
  v_admin uuid;
  v_mgr uuid; v_puremgr uuid; v_emp_in uuid; v_emp_out uuid;
  v_dept_in bigint; v_dept_out bigint;
  v_cap1 bigint; v_cap2 bigint; v_cap3 bigint; v_cap4 bigint; v_cap5 bigint; v_cap6 bigint;
  v_cap7 bigint; v_cap8 bigint;
begin
  if current_setting('t.admin') = '' then
    raise exception 'SETUP: no admin account found';
  end if;
  v_admin := current_setting('t.admin')::uuid;

  -- Three distinct profiles that are not the admin. Any existing rows will do;
  -- we only need identities to attach roles and departments to.
  select id into v_mgr   from public.profiles where id <> v_admin limit 1;
  select id into v_puremgr from public.profiles where id <> v_admin and id <> v_mgr limit 1;
  select id into v_emp_in  from public.profiles where id <> v_admin and id <> v_mgr and id <> v_puremgr limit 1;
  select id into v_emp_out from public.profiles
    where id not in (v_admin, v_mgr, v_puremgr, v_emp_in) limit 1;

  if v_mgr is null or v_puremgr is null or v_emp_in is null or v_emp_out is null then
    raise exception 'SETUP: need an admin plus four other profiles';
  end if;

  perform set_config('t.mgr', v_mgr::text, true);
  perform set_config('t.puremgr', v_puremgr::text, true);
  perform set_config('t.emp_in', v_emp_in::text, true);
  perform set_config('t.emp_out', v_emp_out::text, true);

  -- Two departments. A department row is required by the FK on
  -- profile_departments.department_id; name is the only column the app writes.
  insert into public.departments (name) values ('zz-test dept in') returning id into v_dept_in;
  insert into public.departments (name) values ('zz-test dept out') returning id into v_dept_out;
  perform set_config('t.dept_in', v_dept_in::text, true);
  perform set_config('t.dept_out', v_dept_out::text, true);

  -- The manager: 'management' in D1, AND 'assessment' in D1 (two rows, see the
  -- 2026-10-20 design D6 -- one row per status). added_by is set explicitly
  -- because the app always writes it (department_members_client.tsx L348).
  insert into public.profile_departments (profile_id, department_id, status, added_by, added_at)
    values (v_mgr, v_dept_in, 'management', v_admin, now());
  insert into public.profile_departments (profile_id, department_id, status, added_by, added_at)
    values (v_mgr, v_dept_in, 'assessment', v_admin, now());

  -- The pure manager: 'management' in D1 only.
  insert into public.profile_departments (profile_id, department_id, status, added_by, added_at)
    values (v_puremgr, v_dept_in, 'management', v_admin, now());

  -- The two employees.
  insert into public.profile_departments (profile_id, department_id, status, added_by, added_at)
    values (v_emp_in, v_dept_in, 'assessment', v_admin, now());
  insert into public.profile_departments (profile_id, department_id, status, added_by, added_at)
    values (v_emp_out, v_dept_out, 'assessment', v_admin, now());

  -- One fresh capability per allowed-path check. The manager may assign to ANY
  -- capability (D2), so ownership is deliberately irrelevant and all of these
  -- are ownerless. Six because the PK is (profile_id, capability_id) -- see
  -- the file header.
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 1', null, 'active') returning id into v_cap1;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 2', null, 'active') returning id into v_cap2;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 3', null, 'active') returning id into v_cap3;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 4', null, 'active') returning id into v_cap4;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 5', null, 'active') returning id into v_cap5;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 6', null, 'active') returning id into v_cap6;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 7', null, 'active') returning id into v_cap7;
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-assign 8', null, 'active') returning id into v_cap8;

  perform set_config('t.cap1', v_cap1::text, true);
  perform set_config('t.cap2', v_cap2::text, true);
  perform set_config('t.cap3', v_cap3::text, true);
  perform set_config('t.cap4', v_cap4::text, true);
  perform set_config('t.cap5', v_cap5::text, true);
  perform set_config('t.cap6', v_cap6::text, true);
  perform set_config('t.cap7', v_cap7::text, true);
  perform set_config('t.cap8', v_cap8::text, true);
end $$;

-- ── As the manager (also an assessment-taker) ──────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mgr'), 'role', 'authenticated')::text, true);

-- M1 manager assigns an employee IN A DEPARTMENT THEY MANAGE: allowed.
-- No ON CONFLICT here: the row must not already exist, or this check would
-- pass without RLS ever running.
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap1')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M1: manager insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M1: manager could not assign their own department''s employee';
end $$;

-- M2 manager assigns an employee OUTSIDE their departments: refused
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_out')::uuid, current_setting('t.cap2')::bigint, 'assessment', now());
  raise exception 'FAIL M2: manager assigned an employee outside their departments';
exception when insufficient_privilege then null;
end $$;

-- M3 manager assigns to a capability they do not own: allowed (D2 -- the
-- capability is not consulted at all in the manager branch)
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap3')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M3: manager insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M3: manager could not assign to an unowned capability';
end $$;

-- M4 manager writes a 'management' row: refused (admin-only, unchanged)
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap4')::bigint, 'management', now());
  raise exception 'FAIL M4: manager wrote a management assignment';
exception when insufficient_privilege then null;
end $$;

-- M5 manager updates an assignment within their scope: allowed
do $$ declare n int; begin
  update public.profile_capabilities set added_at = now()
    where profile_id = current_setting('t.emp_in')::uuid
      and capability_id = current_setting('t.cap1')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M5: manager could not update an in-scope assignment (rows=%)', n; end if;
end $$;

-- M6 manager deletes an assignment within their scope: allowed
do $$ declare n int; begin
  delete from public.profile_capabilities
    where profile_id = current_setting('t.emp_in')::uuid
      and capability_id = current_setting('t.cap1')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M6: manager could not remove an in-scope assignment (rows=%)', n; end if;
end $$;

-- M7 manager who is also an assessment-taker assigns THEMSELVES: allowed
-- (they have an 'assessment' row in D1, so can_assign_employee matches)
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.mgr')::uuid, current_setting('t.cap5')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M7: manager self-insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M7: manager who is an assessment-taker could not assign themselves';
end $$;

-- M8 manager SELECTs the assignment rows: allowed (read is untouched)
do $$ declare n int; begin
  select count(*) into n from public.profile_capabilities
    where capability_id in (
      current_setting('t.cap1')::bigint, current_setting('t.cap3')::bigint, current_setting('t.cap5')::bigint
    );
  if n < 1 then raise exception 'FAIL M8: manager could not read assignments (rows=%)', n; end if;
end $$;

-- ── As the pure manager (management only, no assessment row) ───────────
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.puremgr'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- M9 pure manager assigns themselves: refused (they are not an
-- assessment-taker, so can_assign_employee does not match their own id)
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.puremgr')::uuid, current_setting('t.cap2')::bigint, 'assessment', now());
  raise exception 'FAIL M9: a pure manager assigned themselves';
exception when insufficient_privilege then null;
end $$;

-- M10 pure manager assigns an in-scope employee: allowed (manager-ness alone
-- is enough for someone else's row)
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap6')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M10: pure manager insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M10: pure manager could not assign an in-scope employee';
end $$;

-- ── As an admin ────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- M11 admin assigns anyone: allowed
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_out')::uuid, current_setting('t.cap7')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M11: admin insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M11: admin could not assign an employee';
end $$;

-- M12 admin writes a 'management' row: allowed (unchanged). Uses cap8 + emp_in,
-- a pair no other check touches -- the original version shared a pair with M11
-- and failed on the (profile_id, capability_id) primary key instead of testing
-- the policy.
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap8')::bigint, 'management', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M12: admin insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M12: admin could not write a management assignment';
end $$;

-- ── As a capability owner (the dual case) ──────────────────────────────
-- Give t.mgr an owned capability as well, so they are BOTH an owner and a
-- manager: their manager-ness must still be what grants the write.
--
-- A live trigger guards profile_roles role 3 against accounts that do not (or
-- no longer) own a capability, so it is switched off just for this insert --
-- the same technique 2026-10-16_per_capability_permissions_check.sql uses at
-- its O20 step. Everything here is rolled back anyway.
reset role;
alter table public.profile_roles disable trigger user;
insert into public.profile_roles (profile_id, profile_role)
  values (current_setting('t.mgr')::uuid, 3);
do $$
declare v_owned bigint;
begin
  insert into public.capabilities (name, owner_id, status)
    values ('zz-test mgr-owned', current_setting('t.mgr')::uuid, 'active')
    returning id into v_owned;
  perform set_config('t.cap_owned', v_owned::text, true);
end $$;
alter table public.profile_roles enable trigger user;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.mgr'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- M13 owner+manager assigns within their department: allowed (as a manager)
do $$ declare n int; begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_in')::uuid, current_setting('t.cap_owned')::bigint, 'assessment', now());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL M13: owner+manager insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL M13: owner+manager could not assign within their department';
end $$;

-- M14 owner+manager assigns OUTSIDE their department: refused (ownership
-- grants nothing -- only the manager half could authorise this, and it does
-- not reach t.emp_out)
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.emp_out')::uuid, current_setting('t.cap_owned')::bigint, 'assessment', now());
  raise exception 'FAIL M14: owner+manager assigned outside their departments';
exception when insufficient_privilege then null;
end $$;

reset role;
rollback;

select 'All 14 manager assignment checks passed. Nothing was saved.' as result;
