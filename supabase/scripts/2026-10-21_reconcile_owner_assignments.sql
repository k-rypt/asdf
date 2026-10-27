-- Reconciles capabilities.owner_id with the owner's profile_capabilities row.
--
-- WHY THIS EXISTS
-- The two admin paths that set a capability's owner disagreed until
-- 2026-10-21. The invite route (app/api/admin/users/invite/route.ts) wrote
-- BOTH capabilities.owner_id AND a profile_capabilities row with
-- assignment_type = 'management', but the Assign Owner dialog's route
-- (app/api/admin/capabilities/[capability]/owner) wrote only the former.
-- So any owner set or changed from the capability page left the pair out of
-- step:
--
--   * owner set from the capability page   -> no 'management' row
--   * owner switched from A to B           -> A's stale row still present
--   * owner cleared                        -> stale row still present
--
-- Both routes now maintain both records (lib/admin/owner-assignment-sync.ts),
-- which stops NEW drift. This script repairs what already exists.
--
-- THE INVARIANT
--   capabilities.owner_id = P  =>  a profile_capabilities row exists for
--                                  (P, C) that is 'management' *unless* it
--                                  is already 'assessment'
--
-- The 'assessment' exception is intentional. profile_capabilities has a
-- primary key on (profile_id, capability_id) -- one row per person per
-- capability, whatever the assignment_type (documented at
-- app/api/admin/users/invite/route.ts L164-165). Someone who is both an
-- employee and the owner keeps their 'assessment' row; converting it to
-- 'management' would silently delete an assessment assignment. The same
-- rule is applied by syncOwnerAssignment() and the invite route.
--
-- HOW TO RUN
-- Phase 1 is read-only and safe to run any time. Phase 2 makes changes and
-- is commented out -- read Phase 1's output first, then uncomment Phase 2.
-- Run the whole file in the Supabase SQL Editor.
--
-- VERIFIED
-- Both phases were run against a throwaway Postgres seeded with one
-- capability per category above (plus the cases that must be left alone),
-- and checked for the properties you would want before trusting a script
-- that deletes rows:
--
--   * Phase 1 reports exactly the seeded drift, and nothing else.
--   * Phase 2 reaches a state where every count in 2c is zero.
--   * Employee assignments survive: an owner who is also an employee keeps
--     their 'assessment' row and does not gain a second row; an employee's
--     assignment on a capability they do not own is untouched.
--   * It is idempotent -- a second run deletes 0 and inserts 0.
--   * The checks can fail: omitting the stale-row delete, or a naive
--     insert that ignores the 'assessment' exception, both trip them.
--
-- What was NOT verified, because there was no access to the real database:
-- the exact DDL of profile_capabilities. It is not created in any migration
-- in this repo, so its constraints were inferred from how the app uses it.
-- The script only assumes the primary key on (profile_id, capability_id),
-- which the invite route documents, and that capability_id is never null --
-- every consumer joins or filters on it, and none null-checks it. Neither
-- assumption affects Phase 1's or Phase 2's correctness if it were wrong;
-- they only affect whether rows this script would consider odd could exist.

-- ══════════════════════════════════════════════════════════════════════
-- PHASE 1 -- REPORT (read-only)
-- ══════════════════════════════════════════════════════════════════════

-- 1a. Owners with NO row at all for the capability they own.
--     The main category: owners set from the capability page.
select
  'MISSING ROW'                as problem,
  c.id                         as capability_id,
  c.name                       as capability_name,
  c.owner_id,
  p.given_name || ' ' || p.last_name as owner_name,
  p.email                      as owner_email,
  null::text                   as detail
from public.capabilities c
join public.profiles p on p.id = c.owner_id
where c.owner_id is not null
  and not exists (
    select 1 from public.profile_capabilities pc
    where pc.capability_id = c.id and pc.profile_id = c.owner_id
  )

union all

-- 1b. Owners whose only row is 'assessment'.
--     NOT drift: see the invariant note above. Listed so the report explains
--     why Phase 2 leaves these alone, rather than looking like an oversight.
select
  'ASSESSMENT ONLY (ok)'       as problem,
  c.id,
  c.name,
  c.owner_id,
  p.given_name || ' ' || p.last_name,
  p.email,
  'employee + owner: row kept as ''assessment''' as detail
from public.capabilities c
join public.profiles p on p.id = c.owner_id
join public.profile_capabilities pc
  on pc.capability_id = c.id and pc.profile_id = c.owner_id
where c.owner_id is not null
  and pc.assignment_type <> 'management'

union all

-- 1c. 'management' rows belonging to someone who is NOT the capability's
--     current owner. This is the "switched owner" case: A handed C to B,
--     and A's row was never removed.
--
--     This deliberately does not try to distinguish a legitimate
--     historical row: there is no way to tell one apart from a stale one,
--     and the invariant only cares about the current owner.
--
--     The "capability HAS an owner" guard keeps this disjoint from 1d, so
--     a given ROW is never reported twice. A given CAPABILITY may still
--     appear under two headings at once -- the switched-owner case is both
--     "1a: the new owner has no row" and "1c: the old owner's row is
--     stale" -- so the headings count problems, not rows. See 1e.
select
  'STALE ROW'                  as problem,
  c.id,
  c.name,
  c.owner_id                   as current_owner_id,
  p.given_name || ' ' || p.last_name as row_holder_name,
  p.email                      as row_holder_email,
  'row holder is not the current owner' as detail
from public.capabilities c
join public.profile_capabilities pc
  on pc.capability_id = c.id and pc.assignment_type = 'management'
join public.profiles p on p.id = pc.profile_id
where c.owner_id is not null
  and c.owner_id is distinct from pc.profile_id

union all

-- 1d. 'management' rows on a capability with no owner at all.
select
  'ORPHANED ROW'               as problem,
  c.id,
  c.name,
  c.owner_id,
  p.given_name || ' ' || p.last_name,
  p.email,
  'capability has no owner'    as detail
from public.capabilities c
join public.profile_capabilities pc
  on pc.capability_id = c.id and pc.assignment_type = 'management'
join public.profiles p on p.id = pc.profile_id
where c.owner_id is null

order by problem, capability_id;

-- 1e. Summary counts, so an empty repair is unambiguous.
--
--     These count PROBLEMS, not rows, and are deliberately not a partition:
--     a switched owner appears in both owners_missing_a_row (the new owner
--     has none) and stale_management_rows (the old owner's row lingers).
--     Adding them up overstates the work. The two figures that describe
--     what Phase 2 actually does are named for it:
--
--       rows_to_add    -- what 2b inserts (one per missing owner)
--       rows_to_delete -- the total of 2a's two causes
--
--     For the seed in supabase/tests this reads 2 / 1 / 1 / 2 / 2: three
--     rows change, because C2 is counted under two problems.
select
  count(*) filter (where c.owner_id is not null and not exists (
    select 1 from public.profile_capabilities pc
    where pc.capability_id = c.id and pc.profile_id = c.owner_id
  )) as owners_missing_a_row,
  count(*) filter (where c.owner_id is not null and exists (
    select 1 from public.profile_capabilities pc
    where pc.capability_id = c.id
      and pc.assignment_type = 'management'
      and c.owner_id is distinct from pc.profile_id
  )) as stale_management_rows,
  count(*) filter (where c.owner_id is null and exists (
    select 1 from public.profile_capabilities pc
    where pc.capability_id = c.id and pc.assignment_type = 'management'
  )) as orphaned_management_rows,
  -- Rows 2a deletes: stale + orphaned.
  (select count(*)
     from public.capabilities c
     join public.profile_capabilities pc
       on pc.capability_id = c.id
      and pc.assignment_type = 'management'
    where c.owner_id is distinct from pc.profile_id
  ) as rows_to_delete,
  -- Rows 2b inserts: owners with no row at all.
  (select count(*)
     from public.capabilities c
    where c.owner_id is not null
      and not exists (
        select 1 from public.profile_capabilities pc
        where pc.capability_id = c.id and pc.profile_id = c.owner_id
      )
  ) as rows_to_add
from public.capabilities c;

-- ══════════════════════════════════════════════════════════════════════
-- PHASE 2 -- REPAIR (makes changes; uncomment to run)
-- ══════════════════════════════════════════════════════════════════════
--
-- Order matters: remove stale/orphaned rows first, then add the missing
-- ones. Doing it the other way round would briefly insert a row that the
-- stale-row delete could then match, and (more importantly) a failed
-- insert would leave the capability looking repaired when it is not.
--
-- Wrapped in a transaction that is ROLLED BACK by default, matching
-- supabase/tests/*.sql. Read the counts, then change the final rollback to
-- commit yourself when you are happy.

-- begin;
--
-- -- 2a. Drop 'management' rows that belong to someone other than the
-- --     current owner, or to a capability with no owner (1c and 1d). Only
-- --     ever 'management' rows: 'assessment'/'assigned' rows are employee
-- --     assignments and are never touched by ownership.
-- delete from public.profile_capabilities pc
-- using public.capabilities c
-- where pc.capability_id = c.id
--   and pc.assignment_type = 'management'
--   and c.owner_id is distinct from pc.profile_id;
--
-- -- 2b. Give every owner without any row the 'management' row they should
-- --     have had. The NOT EXISTS guard covers BOTH halves of the
-- --     invariant: an owner with an 'assessment' row is already attached
-- --     and must not get a second row (the PK would reject it anyway).
-- insert into public.profile_capabilities
--   (profile_id, capability_id, assignment_type, added_at)
-- select c.owner_id, c.id, 'management', now()
-- from public.capabilities c
-- where c.owner_id is not null
--   and not exists (
--     select 1 from public.profile_capabilities pc
--     where pc.capability_id = c.id and pc.profile_id = c.owner_id
--   );
--
-- -- 2c. Show the post-repair state. Every figure should now be zero. Re-run
-- --     Phase 1 for the row-level detail.
-- select
--   (select count(*) from public.capabilities c
--     where c.owner_id is not null and not exists (
--       select 1 from public.profile_capabilities pc
--       where pc.capability_id = c.id and pc.profile_id = c.owner_id
--     )) as owners_missing_a_row_after,
--   (select count(*)
--      from public.capabilities c
--      join public.profile_capabilities pc
--        on pc.capability_id = c.id and pc.assignment_type = 'management'
--     where c.owner_id is distinct from pc.profile_id
--   ) as stale_management_rows_after;
--
-- rollback;
