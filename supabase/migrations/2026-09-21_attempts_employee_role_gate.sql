  -- Restricts writing to `attempts` / `attempt_answers` to profiles holding
  -- the 'employee' role, not just "you own this row".
  --
  -- Gap found while reviewing "can the assessment be made employee-only?":
  -- app/protected/employee/layout.tsx only checked that a user was signed in,
  -- not that they held the employee role, so anyone with a direct link could
  -- reach /protected/employee/assessment. That UI gate is fixed alongside
  -- this migration (see app/protected/employee/layout.tsx), but RLS is the
  -- real boundary -- without this, a signed-in admin/manager/capability-owner
  -- account could still write attempt rows via a direct API call, since the
  -- existing "Employees can insert their own attempts" policy only checked
  -- profile_id = auth.uid(), never role.
  --
  -- This drops and recreates the insert/update policies on `attempts` and the
  -- insert policy on `attempt_answers` with an added role check, matching the
  -- existing name-based profile_roles -> roles join style already used
  -- elsewhere in this schema (e.g. "Admin or capability owner can view all
  -- attempts"). Select policies are left alone -- admins/capability owners
  -- already have their own broader read policies, and an employee reading
  -- their own past attempt back after being reassigned off the role isn't
  -- the same risk as a non-employee writing a new one.
  --
  -- Before running: this assumes the `roles` row for employees is named
  -- exactly 'employee' (lowercase), matching the casing already used for
  -- 'admin' / 'capability owner' in this schema. Confirm with:
  --   select id, name from roles;
  -- and adjust the literal below if it differs.

  begin;

  drop policy if exists "Employees can insert their own attempts" on public.attempts;

  create policy "Employees can insert their own attempts"
    on public.attempts for insert
    to authenticated
    with check (
      profile_id = auth.uid()
      and exists (
        select 1 from profile_roles pr
        join roles r on pr.profile_role = r.id
        where pr.profile_id = auth.uid()
          and r.name = 'employee'
      )
    );

  drop policy if exists "Employees can update their own in-progress attempts" on public.attempts;

  create policy "Employees can update their own in-progress attempts"
    on public.attempts for update
    to authenticated
    using (profile_id = auth.uid())
    with check (
      profile_id = auth.uid()
      and exists (
        select 1 from profile_roles pr
        join roles r on pr.profile_role = r.id
        where pr.profile_id = auth.uid()
          and r.name = 'employee'
      )
    );

  drop policy if exists "Employees can insert answers for their own attempt" on public.attempt_answers;

  create policy "Employees can insert answers for their own attempt"
    on public.attempt_answers for insert
    to authenticated
    with check (
      exists (
        select 1 from public.attempts a
        where a.id = attempt_answers.attempt_id
          and a.profile_id = auth.uid()
      )
      and exists (
        select 1 from profile_roles pr
        join roles r on pr.profile_role = r.id
        where pr.profile_id = auth.uid()
          and r.name = 'employee'
      )
    );

  commit;