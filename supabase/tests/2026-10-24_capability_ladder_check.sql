-- Verifies 2026-10-24_capability_ladder.sql. Run the whole file in the
-- Supabase SQL Editor AFTER the migration. It creates throwaway data,
-- impersonates users and rolls everything back. Success = one row saying
-- all checks passed; a failure stops at the first FAIL message.

begin;

-- L1 backfill: one ladder row per (capability, level) that had tiers.
do $$ declare expected int; actual int; begin
  select count(*) into expected from (
    select distinct a.capability_id, t.sfia_level
    from public.assessment_tiers t join public.assessments a on a.id = t.assessment_id
    where a.capability_id is not null and t.sfia_level between 1 and 7) s;
  select count(*) into actual from public.capability_ladder_levels;
  if actual < expected then
    raise exception 'FAIL L1: backfill has % rows, expected at least %', actual, expected;
  end if;
end $$;

-- Setup (as the SQL Editor's role; RLS doesn't apply here). Same picks as
-- 2026-10-16_per_capability_permissions_check.sql: an existing capability
-- owner (role 3, not admin) and an admin. Reusing a real owner avoids
-- inserting a role 3 row, which a live trigger guards.
select set_config('t.owner', coalesce((
  select pr.profile_id::text from public.profile_roles pr
  where pr.profile_role = 3
    and not exists (select 1 from public.profile_roles a where a.profile_id = pr.profile_id and a.profile_role = 1)
  limit 1), ''), true);
select set_config('t.admin', coalesce((
  select profile_id::text from public.profile_roles where profile_role = 1 limit 1), ''), true);

do $$
declare v_owner uuid; v_mine bigint; v_other bigint;
begin
  if current_setting('t.owner') = '' then
    raise exception 'SETUP: no account has the capability-owner role without admin';
  end if;
  if current_setting('t.admin') = '' then
    raise exception 'SETUP: no admin account found';
  end if;
  v_owner := current_setting('t.owner')::uuid;

  insert into public.capabilities (name, owner_id, status) values ('zz-test ladder mine', v_owner, 'active') returning id into v_mine;
  insert into public.capabilities (name, owner_id, status) values ('zz-test ladder other', null, 'active') returning id into v_other;

  perform set_config('t.mine', v_mine::text, true);
  perform set_config('t.other', v_other::text, true);
end $$;

-- As the owner
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

-- L2 owner writes their own capability's ladder: allowed
do $$ begin
  insert into public.capability_ladder_levels (capability_id, sfia_level, label)
    values (current_setting('t.mine')::bigint, 1, 'P1 - Check');
exception when insufficient_privilege then
  raise exception 'FAIL L2: owner could not add a level to their own capability';
end $$;

-- L3 owner writes an unowned capability's ladder: refused
do $$ begin
  insert into public.capability_ladder_levels (capability_id, sfia_level, label)
    values (current_setting('t.other')::bigint, 1, 'P1 - Nope');
  raise exception 'FAIL L3: owner added a level to a capability they do not own';
exception when insufficient_privilege then null;
end $$;

-- L4 bad threshold refused by the check constraint
do $$ begin
  insert into public.capability_ladder_levels (capability_id, sfia_level, label, pass_threshold)
    values (current_setting('t.mine')::bigint, 2, 'P2 - Bad', 1.5);
  raise exception 'FAIL L4: pass_threshold 1.5 was accepted';
exception when check_violation then null;
end $$;

-- As an admin
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true);
set local role authenticated;

-- L5 admin writes any ladder: allowed
do $$ declare n int; begin
  insert into public.capability_ladder_levels (capability_id, sfia_level, label)
    values (current_setting('t.other')::bigint, 1, 'P1 - Admin');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL L5: admin insert touched % rows', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL L5: admin could not add a level';
end $$;

reset role;
rollback;

select 'All 5 capability ladder checks passed. Nothing was saved.' as result;
