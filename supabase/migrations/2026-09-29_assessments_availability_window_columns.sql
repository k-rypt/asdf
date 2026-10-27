-- New columns the Publish action (Task 6) sets: when this assessment
-- starts and stops being offered to employees. Both nullable --
-- available_until: null means "no expiry", an explicit owner choice made
-- at Publish time, not a default. available_from is always set by Publish
-- (to now()), but stays nullable at the schema level since nothing
-- enforces "every assessment has been published" -- draft/archived rows
-- can have either column null.
-- See docs/superpowers/specs/2026-09-29-assessment-availability-window-design.md
-- "Schema changes".

begin;

alter table public.assessments
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz;

commit;
