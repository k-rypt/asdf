-- `questions.irt_a` / `questions.irt_b_thresholds` are NOT NULL, but they're
-- real IRT/GRM calibration data (discrimination + difficulty thresholds),
-- not something an author -- human or AI -- fills in at question-creation
-- time. A freshly AI-drafted question is 'pending_review' and hasn't been
-- calibrated yet, so it has no honest value for these columns to hold.
--
-- The rest of the app already treats a missing IRT profile as the expected
-- "not calibrated yet" state, not an error -- see
-- components/protected/capabilities/question-detail-view.tsx, which only
-- renders the IRT Psychometric Profile card
-- `if (question.irt_a != null && Array.isArray(question.irt_b_thresholds)
-- && question.irt_b_thresholds.length > 0)`. The NOT NULL constraint is
-- what's actually inconsistent with that design, not the other way
-- around -- surfaced by generateAssessmentFromJobDescription's questions
-- insert (app/api/admin/capabilities/[capability]/generate-assessment)
-- deliberately not fabricating these values (see the doc comment on
-- generateAssessmentFromJobDescription in
-- assessment-toolkit/packages/assessment-core/src/server) and hitting
-- "null value in column \"irt_b_thresholds\" of relation \"questions\"
-- violates not-null constraint" as a result.
--
-- (`questions` predates this migrations folder, so this can't verify these
-- columns' exact types beyond how the app already reads them -- irt_a as a
-- number, irt_b_thresholds as an array -- but dropping NOT NULL doesn't
-- require knowing the type.)

begin;

  alter table public.questions alter column irt_a drop not null;
  alter table public.questions alter column irt_b_thresholds drop not null;

commit;
