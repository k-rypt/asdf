-- Fixes preset_current_status to match the status vocabulary documented in
-- docs/superpowers/specs/2026-10-10-preset-approval-queue-design.md (lines
-- 104-107): draft (no rows), pending_approval (latest action 'submitted'),
-- approved, rejected. Task 1's original view passed `action` straight
-- through as `status`, so a submitted preset's status was 'submitted',
-- never 'pending_approval' -- silently breaking every downstream consumer
-- that checks for the literal string 'pending_approval' (reject route,
-- approve route, status badge, admin Approvals page query).
begin;

create or replace view public.preset_current_status
with (security_invoker = true)
as
select distinct on (preset_id)
  preset_id,
  case action when 'submitted' then 'pending_approval' else action end as status,
  note,
  created_by,
  created_at
from public.preset_approvals
order by preset_id, created_at desc;

revoke select on public.preset_current_status from anon;

commit;
