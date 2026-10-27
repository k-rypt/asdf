-- Undo 2026-10-20_manager_assignment.sql: restore the three
-- profile_capabilities write policies to the bodies they had in
-- 2026-10-16_per_capability_permissions.sql, and remove the new helper.
-- Only run this if the migration needs reverting.

begin;

drop policy if exists "Capability managers insert assignments" on public.profile_capabilities;
drop policy if exists "Capability managers update assignments" on public.profile_capabilities;
drop policy if exists "Capability managers delete assignments" on public.profile_capabilities;

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

drop function if exists public.can_assign_employee(uuid);

commit;
