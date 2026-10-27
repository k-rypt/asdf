-- Adds the two enum values discovered to be missing after confirming
-- `questions.status` (question_status) and `questions.type`
-- (question_type) are Postgres enums, not text + check constraint:
--
--   question_status: active, draft, archived            -> add pending_review
--   question_type:   multiple_choice, true_false, code_snippet -> add yes_no
--
-- `true_false` is kept as its own distinct value from the new `yes_no` --
-- true_false is a graded code/logic question rendered with two options,
-- while yes_no is the ungraded, tiered self-assessment ladder format
-- (see schema_03_yesno_ladder.sql).
--
-- IMPORTANT: run each statement below ONE AT A TIME (select just that
-- line and execute), not as a single multi-statement script and not
-- wrapped in begin/commit. `alter type ... add value` must run outside
-- an explicit transaction block.

alter type question_status add value if not exists 'pending_review';

alter type question_type add value if not exists 'yes_no';
