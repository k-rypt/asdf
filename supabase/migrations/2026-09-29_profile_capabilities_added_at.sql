-- profile_capabilities predates the migrations folder and has never
-- carried a timestamp, unlike its sibling profile_departments.added_at
-- (which department_members_client.tsx already sorts "Recently Added" /
-- "Oldest Added" by). Needed so a per-employee availability window can
-- start from *when the employee was assigned to the capability*, not
-- just when the assessment was published -- see the spec's "Per-employee
-- window computation" section.
--
-- `not null default now()` backfills every existing row to the moment
-- this migration runs (no better information exists for rows that
-- predate this column) -- see this plan's Review Focus for why that's an
-- accepted, verified trade-off rather than a silent gap.

begin;

alter table public.profile_capabilities
  add column if not exists added_at timestamptz not null default now();

commit;
