-- gradeCodeSubmission's AiGradingResponse has always computed
-- sfia_level_assigned and knowledgeGaps alongside the fields the
-- 2026-10-02 migration persisted (display_level, feedback, etc.), but
-- nothing ever read them past the grading call -- submitAnswer's `result`
-- object (lib/assessment/supabase-assessment-api-client.ts) silently
-- dropped both. This widens attempt_answers to carry them too, so a
-- code_snippet result can show the assigned SFIA level and the specific
-- knowledge gaps the AI identified, not just the rolled-up displayLevel/
-- feedback.

begin;

alter table public.attempt_answers
  add column if not exists sfia_level_assigned smallint;

alter table public.attempt_answers
  add column if not exists knowledge_gaps jsonb;

commit;
