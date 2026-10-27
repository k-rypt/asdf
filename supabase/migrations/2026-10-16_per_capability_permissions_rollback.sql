-- Undo 2026-10-16_per_capability_permissions.sql: restore every policy on
-- the affected tables exactly as it was, and remove the new helpers and
-- trigger. Only run this if the migration needs reverting.

begin;

drop trigger if exists capabilities_owner_edit_guard on public.capabilities;
drop function if exists public.capabilities_owner_edit_guard();

do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (select distinct tablename from public._policy_backup_20261016)
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  for p in select * from public._policy_backup_20261016 loop
    execute format(
      'create policy %I on public.%I as %s for %s to %s %s %s',
      p.policyname, p.tablename, p.permissive, p.cmd, array_to_string(p.roles, ', '),
      coalesce('using (' || p.qual || ')', ''),
      coalesce('with check (' || p.with_check || ')', '')
    );
  end loop;
end $$;

drop function if exists public.can_manage_capability(bigint);
drop function if exists public.question_capability_id(uuid);
drop function if exists public.preset_capability_id(bigint);
drop function if exists public.assessment_capability_id(bigint);
drop function if exists public.is_admin();
drop table public._policy_backup_20261016;

commit;
