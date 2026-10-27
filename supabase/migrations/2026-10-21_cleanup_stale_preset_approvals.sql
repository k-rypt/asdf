-- Clean up stale pending approvals when a preset is no longer the active preset of a capability.
-- If a preset is waiting approval, but was removed as "active", the approval disappears.

begin;

-- 1. One-time cleanup of existing orphaned pending approvals
delete from public.preset_approvals pa
using public.question_presets qp, public.capabilities c
where pa.preset_id = qp.id
  and qp.capability_id = c.id
  and pa.action = 'submitted'
  and (c.current_preset is null or c.current_preset <> qp.id);

-- 2. Trigger function to keep preset approvals in sync when current_preset changes or is removed
create or replace function public.handle_capabilities_current_preset_change()
returns trigger as $$
begin
  if new.current_preset is null then
    -- When active preset is cleared/removed, remove pending approvals for any preset of this capability
    delete from public.preset_approvals pa
    using public.question_presets qp
    where pa.preset_id = qp.id
      and qp.capability_id = new.id
      and pa.action = 'submitted';
  elsif old.current_preset is not null and (new.current_preset is distinct from old.current_preset) then
    -- When active preset changes to another preset, remove pending approvals for the previous preset
    delete from public.preset_approvals
    where preset_id = old.current_preset
      and action = 'submitted';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists cleanup_stale_preset_approvals_on_change on public.capabilities;
create trigger cleanup_stale_preset_approvals_on_change
  after update on public.capabilities
  for each row execute function public.handle_capabilities_current_preset_change();

commit;
