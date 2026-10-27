-- Adds the language/tech_domain columns needed for code_snippet questions.
--
-- Flagged while building SupabaseAssessmentApiClient: `questions` had no
-- column recording which language a code question is written in, so the
-- client was silently defaulting every code_snippet question to
-- 'javascript'. This adds the missing columns; a follow-up code change will
-- read them instead of the hardcoded default once this has been run.
--
-- Before running: check whether any code_snippet questions already exist --
--   select id, title from questions where type = 'code_snippet';
-- If any come back, they'll have language = null after this migration and
-- will need a manual backfill (a wrong guess on my part would be worse than
-- a gap here). If that query returns zero rows, there's nothing to backfill.

begin;

alter table public.questions
  add column if not exists language text,
  add column if not exists tech_domain text; -- e.g. 'html_css' -- see CodeQuestion.techDomain in assessment-toolkit; switches grading/UI into static-analysis mode instead of compiled-output mode

-- Deliberately left nullable rather than enforcing "code_snippet questions
-- must have a language" at the DB level -- there's no question-authoring UI
-- yet to guarantee that at insert time (the capability-tabs "+" button is
-- still a no-op), and a migration that fails on some pre-existing row is
-- worse than a temporarily-permissive column. The allowed-values list is
-- still enforced, matching assessment-toolkit's CodeLanguage union type.
alter table public.questions
  add constraint questions_lError: Failed to run sql query: ERROR: 42710: constraint "questions_language_check" for relation "questions" already existsanguage_check
  check (language is null or language in ('java', 'javascript', 'typescript', 'python', 'csharp', 'html_css'));

commit;
