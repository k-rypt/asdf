-- Backfills `language` for the code_snippet questions that already existed
-- before 2026-09-21_questions_code_language.sql added the column.
--
-- All three current code_snippet rows are Python -- confirmed by inspecting
-- starter_code directly (`def ...:` / `pass`, snake_case), not guessed.
--
-- Run this AFTER 2026-09-21_questions_code_language.sql has been applied.

begin;

update public.questions
set language = 'python'
where type = 'code_snippet'
  and id in (
    '4cc636bf-18fa-40ba-b34a-cc064c4d24ce', -- Two Sum
    '5516d789-276d-4ca7-9e33-0ea89866c96b', -- Palindrome Checker
    '52d3bf53-4022-400a-a840-5f906a772b90'  -- Merge Overlapping Intervals
  );

commit;
