-- Item calibration + theta scoring columns.
--
-- No new tables -- classical item stats (n, p/p_k, r) are recomputed from
-- attempt_answers each time calibrateQuestion runs; only the output lands
-- here. See docs/superpowers/specs/2026-10-01-item-calibration-theta-scoring-design.md.
--
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor) -- the app
-- only ever has the anon/publishable key at runtime, so this can't be
-- applied programmatically from the repo.

begin;

  alter table public.questions
    add column if not exists calibration_method text not null default 'uncalibrated',
    add column if not exists calibration_n integer,
    add column if not exists last_calibrated_at timestamptz;

  alter table public.questions
    add constraint questions_calibration_method_check
    check (calibration_method in ('uncalibrated', 'classical'));

  alter table public.attempts
    add column if not exists theta_estimate numeric,
    add column if not exists theta_se numeric;

commit;
