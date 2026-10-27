-- Undo 2026-10-24_capability_ladder.sql. assessment_tiers is untouched by
-- that migration, so dropping the ladder table loses only ladder edits made
-- since; every assessment keeps its own tiers.
begin;
drop table if exists public.capability_ladder_levels;
commit;
