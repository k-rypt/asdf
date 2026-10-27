-- Add updated_at timestamp to public.capabilities and keep it updated
-- automatically on updates.

begin;

alter table public.capabilities
  add column if not exists updated_at timestamptz not null default now();

update public.capabilities
set updated_at = coalesce(created_at, now());

create or replace function public.handle_capabilities_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_capabilities_updated_at on public.capabilities;
create trigger set_capabilities_updated_at
  before update on public.capabilities
  for each row execute function public.handle_capabilities_updated_at();

-- Update the owner edit guard so non-admin owners changing their description
-- don't get rejected by the automatically updated updated_at column.
create or replace function public.capabilities_owner_edit_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'description' - 'updated_at') is distinct from (to_jsonb(old) - 'description' - 'updated_at') then
    raise exception 'Capability owners can only change the description.'
      using errcode = '42501';
  end if;
  return new;
end
$$;

commit;
