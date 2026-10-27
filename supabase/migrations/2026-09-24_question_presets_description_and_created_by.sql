  -- Task 5's create-preset route and the Customize Preset dialog (Section 3
  -- of the design spec) need a description field and an author reference --
  -- neither existed on question_presets (confirmed via the live table
  -- definition: id, capability_id, name, created_at, duration_minutes,
  -- passing_score, question_type_mix only). Without this, text typed into
  -- the dialog's description field would be silently discarded.

  begin;

  alter table public.question_presets
    add column if not exists description text,
    add column if not exists created_by uuid references auth.users(id) on delete set null;

  commit;
