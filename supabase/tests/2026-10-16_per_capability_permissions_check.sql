-- Verifies 2026-10-16_per_capability_permissions.sql, as amended by
-- 2026-10-20_manager_assignment.sql (which removed the owner's write path
-- on profile_capabilities and made assignment a manager function -- see
-- supabase/tests/2026-10-20_manager_assignment_check.sql for the manager
-- side). Run the whole file in the Supabase SQL Editor. It creates
-- throwaway test data, impersonates users, and rolls everything back.
-- Success = one row saying all checks passed. A failure stops at the first
-- FAIL message.

begin;

-- ── Setup (as the SQL Editor's role; RLS doesn't apply here) ──────────
select set_config('t.owner', coalesce((
  select pr.profile_id::text from public.profile_roles pr
  where pr.profile_role = 3
    and not exists (select 1 from public.profile_roles a where a.profile_id = pr.profile_id and a.profile_role = 1)
  limit 1), ''), true);
select set_config('t.admin', coalesce((
  select profile_id::text from public.profile_roles where profile_role = 1 limit 1), ''), true);
select set_config('t.third', coalesce((
  select id::text from public.profiles
  where id::text not in (current_setting('t.owner'), current_setting('t.admin'))
  limit 1), ''), true);

do $$
declare
  v_owner uuid;
  cap_own bigint; cap_other bigint;
  q_own uuid; q_other uuid;
  p_own bigint; p_other bigint;
  a_own bigint; a_other bigint;
begin
  if current_setting('t.owner') = '' then
    raise exception 'SETUP: no account has the capability-owner role without admin';
  end if;
  if current_setting('t.admin') = '' then
    raise exception 'SETUP: no admin account found';
  end if;
  if current_setting('t.third') = '' then
    raise exception 'SETUP: need a third profile for the management-row checks';
  end if;
  v_owner := current_setting('t.owner')::uuid;

  insert into public.capabilities (name, owner_id, status) values ('zz-test own', v_owner, 'active') returning id into cap_own;
  insert into public.capabilities (name, owner_id, status) values ('zz-test other', null, 'active') returning id into cap_other;

  insert into public.questions (capability_id, title, description, type, status)
    values (cap_own, 'zz-test', 'zz-test', 'multiple_choice', 'active') returning id into q_own;
  insert into public.questions (capability_id, title, description, type, status)
    values (cap_other, 'zz-test', 'zz-test', 'multiple_choice', 'active') returning id into q_other;

  insert into public.question_presets (capability_id, name) values (cap_own, 'zz-test') returning id into p_own;
  insert into public.question_presets (capability_id, name) values (cap_other, 'zz-test') returning id into p_other;

  insert into public.assessments (capability_id, name, status, created_by) values (cap_own, 'zz-test', 'draft', v_owner) returning id into a_own;
  insert into public.assessments (capability_id, name, status, created_by) values (cap_other, 'zz-test', 'draft', v_owner) returning id into a_other;

  insert into public.assessment_tiers (assessment_id, sfia_level, label, pass_threshold, advance_message, stay_message, position)
    values (a_other, 2, 'zz-test', 0.6, 'a', 's', 0);
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.third')::uuid, cap_own, 'management', now());

  perform set_config('t.cap_own', cap_own::text, true);
  perform set_config('t.cap_other', cap_other::text, true);
  perform set_config('t.q_own', q_own::text, true);
  perform set_config('t.q_other', q_other::text, true);
  perform set_config('t.p_own', p_own::text, true);
  perform set_config('t.p_other', p_other::text, true);
  perform set_config('t.a_own', a_own::text, true);
  perform set_config('t.a_other', a_other::text, true);
end $$;

-- ── As the capability owner ────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);

-- O1 own question: allowed
do $$ declare n int; begin
  update public.questions set title = 'zz-test 2' where id = current_setting('t.q_own')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL O1: owner could not edit own question (rows=%)', n; end if;
end $$;

-- O2 other question: no rows touched
do $$ declare n int; begin
  update public.questions set title = 'x' where id = current_setting('t.q_other')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O2: owner edited another capability''s question'; end if;
end $$;

-- O3 new question in other capability: refused
do $$ begin
  insert into public.questions (capability_id, title, description, type, status)
    values (current_setting('t.cap_other')::bigint, 'x', 'x', 'multiple_choice', 'active');
  raise exception 'FAIL O3: owner added a question to another capability';
exception when insufficient_privilege then null;
end $$;

-- O4 choice on other question: refused
do $$ begin
  insert into public.question_choices (question_id, context, is_correct)
    values (current_setting('t.q_other')::uuid, 'x', false);
  raise exception 'FAIL O4: owner added a choice to another capability''s question';
exception when insufficient_privilege then null;
end $$;

-- O5 own preset rename: allowed
do $$ declare n int; begin
  update public.question_presets set name = 'zz-test 2' where id = current_setting('t.p_own')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL O5: owner could not rename own preset (rows=%)', n; end if;
end $$;

-- O6 delete other preset: no rows touched
do $$ declare n int; begin
  delete from public.question_presets where id = current_setting('t.p_other')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O6: owner deleted another capability''s preset'; end if;
end $$;

-- O7 submit own preset: allowed
do $$ begin
  insert into public.preset_approvals (preset_id, action, created_by)
    values (current_setting('t.p_own')::bigint, 'submitted', current_setting('t.owner')::uuid);
exception when insufficient_privilege then
  raise exception 'FAIL O7: owner could not submit own preset';
end $$;

-- O8 approve own preset: refused
do $$ begin
  insert into public.preset_approvals (preset_id, action, created_by)
    values (current_setting('t.p_own')::bigint, 'approved', current_setting('t.owner')::uuid);
  raise exception 'FAIL O8: owner approved a preset';
exception when insufficient_privilege then null;
end $$;

-- O9 own draft assessment rename: allowed
do $$ declare n int; begin
  update public.assessments set name = 'zz-test 2' where id = current_setting('t.a_own')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL O9: owner could not edit own draft assessment (rows=%)', n; end if;
end $$;

-- O10 publish own assessment: refused
do $$ begin
  update public.assessments set status = 'published' where id = current_setting('t.a_own')::bigint;
  raise exception 'FAIL O10: owner published an assessment';
exception when insufficient_privilege then null;
end $$;

-- O11 other capability's tier: no rows touched
do $$ declare n int; begin
  update public.assessment_tiers set label = 'x' where assessment_id = current_setting('t.a_other')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O11: owner edited another capability''s tier'; end if;
end $$;

-- O12 add a question to other capability's assessment: refused
do $$ begin
  insert into public.assessment_questions (assessment_id, question_id, position)
    values (current_setting('t.a_other')::bigint, current_setting('t.q_other')::uuid, 0);
  raise exception 'FAIL O12: owner changed another capability''s assessment';
exception when insufficient_privilege then null;
end $$;

-- O13 owner assigns themselves to own capability: refused (2026-10-20:
-- assignment is a manager function now -- an owner has no write policy on
-- profile_capabilities at all, so this is no longer allowed).
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.owner')::uuid, current_setting('t.cap_own')::bigint, 'assessment', now());
  raise exception 'FAIL O13: owner assigned someone to own capability';
exception when insufficient_privilege then null;
end $$;

-- O14 owner assigns someone to other capability: refused (unchanged result,
-- different reason -- there is simply no owner write path left).
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.owner')::uuid, current_setting('t.cap_other')::bigint, 'assessment', now());
  raise exception 'FAIL O14: owner assigned someone to another capability';
exception when insufficient_privilege then null;
end $$;

-- O15 add a 'management' row, even on own capability: refused
do $$ begin
  insert into public.profile_capabilities (profile_id, capability_id, assignment_type, added_at)
    values (current_setting('t.admin')::uuid, current_setting('t.cap_own')::bigint, 'management', now());
  raise exception 'FAIL O15: owner added a management assignment';
exception when insufficient_privilege then null;
end $$;

-- O16 own description: allowed
do $$ declare n int; begin
  update public.capabilities set description = 'zz-test' where id = current_setting('t.cap_own')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL O16: owner could not edit own description (rows=%)', n; end if;
end $$;

-- O17 own status: refused by the trigger
do $$ begin
  update public.capabilities set status = 'archived' where id = current_setting('t.cap_own')::bigint;
  raise exception 'FAIL O17: owner changed own capability status';
exception when insufficient_privilege then null;
end $$;

-- O18 own owner_id: refused by the trigger
do $$ begin
  update public.capabilities set owner_id = null where id = current_setting('t.cap_own')::bigint;
  raise exception 'FAIL O18: owner changed own capability owner';
exception when insufficient_privilege then null;
end $$;

-- O19 other (unowned) capability description: no rows touched
do $$ declare n int; begin
  update public.capabilities set description = 'x' where id = current_setting('t.cap_other')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O19: owner edited an unowned capability'; end if;
end $$;

-- O22 owner adds a choice to own question: allowed
do $$ begin
  insert into public.question_choices (question_id, context, is_correct)
    values (current_setting('t.q_own')::uuid, 'zz-test', false);
exception when insufficient_privilege then
  raise exception 'FAIL O22: owner could not add a choice to own question';
end $$;

-- O23 owner links and unlinks a question on own preset: allowed
do $$ declare n int; begin
  insert into public.question_preset_questions (preset_id, question_id)
    values (current_setting('t.p_own')::bigint, current_setting('t.q_own')::uuid);
  delete from public.question_preset_questions
    where preset_id = current_setting('t.p_own')::bigint and question_id = current_setting('t.q_own')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL O23: owner could not unlink a question from own preset (rows=%)', n; end if;
exception when insufficient_privilege then
  raise exception 'FAIL O23: owner could not link a question to own preset';
end $$;

-- O24 owner adds a question to own assessment: allowed
do $$ begin
  insert into public.assessment_questions (assessment_id, question_id, position)
    values (current_setting('t.a_own')::bigint, current_setting('t.q_own')::uuid, 0);
exception when insufficient_privilege then
  raise exception 'FAIL O24: owner could not add a question to own assessment';
end $$;

-- O25 owner adds a tier to own assessment: allowed
do $$ begin
  insert into public.assessment_tiers (assessment_id, sfia_level, label, pass_threshold, advance_message, stay_message, position)
    values (current_setting('t.a_own')::bigint, 2, 'zz-test', 0.6, 'a', 's', 0);
exception when insufficient_privilege then
  raise exception 'FAIL O25: owner could not add a tier to own assessment';
end $$;

-- O26 owner writes a deadline flag for own assessment: allowed
do $$ begin
  insert into public.assessment_deadline_flags (assessment_id, profile_id, capability_id)
    values (current_setting('t.a_own')::bigint, current_setting('t.third')::uuid, current_setting('t.cap_own')::bigint);
exception when insufficient_privilege then
  raise exception 'FAIL O26: owner could not write a deadline flag for own assessment';
end $$;

-- O27 owner deletes or demotes a management row on own capability: no rows touched
do $$ declare n int; begin
  delete from public.profile_capabilities
    where profile_id = current_setting('t.third')::uuid and capability_id = current_setting('t.cap_own')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O27: owner deleted a management assignment'; end if;
  update public.profile_capabilities set assignment_type = 'assessment'
    where profile_id = current_setting('t.third')::uuid and capability_id = current_setting('t.cap_own')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O27: owner demoted a management assignment'; end if;
end $$;

-- O28 owner sets own capability's active preset: refused by the trigger
do $$ begin
  update public.capabilities set current_preset = current_setting('t.p_own')::bigint
    where id = current_setting('t.cap_own')::bigint;
  raise exception 'FAIL O28: owner changed own capability''s active preset';
exception when insufficient_privilege then null;
end $$;

-- ── Owner loses the capability-owner role ──────────────────────────────
-- A live trigger refuses to remove role 3 from someone who still owns a
-- capability, so switch it off just for this delete (rolled back anyway).
reset role;
alter table public.profile_roles disable trigger user;
delete from public.profile_roles
  where profile_id = current_setting('t.owner')::uuid and profile_role = 3;
alter table public.profile_roles enable trigger user;
set local role authenticated;

-- O20 former owner, own question: no rows touched
do $$ declare n int; begin
  update public.questions set title = 'x' where id = current_setting('t.q_own')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O20: owner without the role still edited their capability'; end if;
end $$;

-- ── Service role / SQL Editor (no auth.uid) ────────────────────────────
reset role;
select set_config('request.jwt.claims', '{}', true);

-- S1 owner change without a signed-in user: allowed (invite relies on this)
do $$ declare n int; begin
  -- (clearing the owner: a live trigger only lets role-3 accounts be owners)
  update public.capabilities set owner_id = null
    where id = current_setting('t.cap_own')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL S1: trigger blocked a service-role owner change'; end if;
end $$;

-- ── As an admin ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.admin'), 'role', 'authenticated')::text, true);

-- A1 admin edits any question
do $$ declare n int; begin
  update public.questions set title = 'zz-test admin' where id = current_setting('t.q_other')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL A1: admin could not edit a question (rows=%)', n; end if;
end $$;

-- A2 admin changes a capability's status
do $$ declare n int; begin
  update public.capabilities set status = 'archived' where id = current_setting('t.cap_other')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL A2: admin could not change capability status (rows=%)', n; end if;
end $$;

-- A3 admin publishes an assessment
do $$ declare n int; begin
  update public.assessments set status = 'published' where id = current_setting('t.a_own')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL A3: admin could not publish (rows=%)', n; end if;
end $$;

-- A4 admin approves a preset
do $$ begin
  insert into public.preset_approvals (preset_id, action, created_by, created_at)
    values (current_setting('t.p_own')::bigint, 'approved', current_setting('t.admin')::uuid, now() + interval '1 second');
exception when insufficient_privilege then
  raise exception 'FAIL A4: admin could not approve a preset';
end $$;

-- O21 owner edits an approved preset: no rows touched (restrictive lock)
reset role;
insert into public.profile_roles (profile_id, profile_role)
  values (current_setting('t.owner')::uuid, 3);
update public.capabilities set owner_id = current_setting('t.owner')::uuid
  where id = current_setting('t.cap_own')::bigint;  -- S1 cleared it
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.owner'), 'role', 'authenticated')::text, true);
do $$ declare n int; begin
  update public.question_presets set name = 'x' where id = current_setting('t.p_own')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O21: owner edited an approved preset'; end if;
end $$;

-- O29 owner un-publishes own published assessment: no rows touched
do $$ declare n int; begin
  update public.assessments set status = 'draft' where id = current_setting('t.a_own')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O29: owner un-published an assessment'; end if;
end $$;

-- O30 owner deletes own published assessment: no rows touched
do $$ declare n int; begin
  delete from public.assessments where id = current_setting('t.a_own')::bigint;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL O30: owner deleted a published assessment'; end if;
end $$;

reset role;
rollback;

select 'All 35 per-capability permission checks passed. Nothing was saved.' as result;
