-- supabase/migrations/2026-10-10_notifications_preset_decisions.sql
begin;

alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'upcoming', 'active_started', 'active_midpoint', 'active_due_soon',
      'attempt_completed', 'preset_approved', 'preset_rejected'
    )
  ),
  add column preset_id bigint references public.question_presets(id) on delete cascade,
  add column preset_approval_id bigint references public.preset_approvals(id) on delete cascade;

-- Mirrors notifications_attempt_completed_unique: one notification per
-- profile per decision event. Each rejection is its own preset_approvals
-- row (a new id every time), so a preset rejected twice across two
-- submission cycles correctly produces two notifications, not zero after
-- the first.
create unique index notifications_preset_decision_unique
  on public.notifications (profile_id, preset_approval_id)
  where preset_approval_id is not null;

commit;
