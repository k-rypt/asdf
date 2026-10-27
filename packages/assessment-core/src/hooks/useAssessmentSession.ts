import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssessmentApiClient } from '../client/AssessmentApiClient';
import type { Answer, CompleteSessionResult, Question, SubmissionResult } from '../types';

export type AssessmentSessionStatus =
  | 'idle'
  | 'checking_status'
  | 'starting'
  | 'in_progress'
  | 'submitting'
  | 'completed'
  | 'locked_out'
  | 'error';

export interface UseAssessmentSessionOptions {
  api: AssessmentApiClient;
  userId: string | null;
  /** assessments.id -- which assessment definition to start/resume. Required: there is no implicit "the one assessment" concept at this layer anymore. */
  assessmentDefinitionId: string;
  /** Optional cap on number of questions, enforced client-side in addition to whatever the backend does. */
  maxQuestions?: number;
}

export interface UseAssessmentSessionResult {
  status: AssessmentSessionStatus;
  assessmentId: string | null;
  currentQuestion: Question | null;
  results: SubmissionResult[];
  /** Total questions reported by startSession, capped at maxQuestions. Null until started or if the host doesn't report it. */
  questionCount: number | null;
  finalTheta: CompleteSessionResult | null;
  error: string | null;
  /** Checks lockout status and starts a session + loads the first question. */
  begin: () => Promise<void>;
  /** Submits an answer for the current question and advances to the next one (or completes). */
  submitCurrent: (answer: Answer, timeSpentSeconds: number) => Promise<void>;
  /** Ends the session early (e.g. integrity violation) and marks it invalidated. */
  forceSubmit: (reason: string) => Promise<void>;
}

/**
 * Top-level orchestrator: session start, fixed-order question sequencing,
 * answer submission, and result accumulation. Delegates every piece of
 * backend I/O to the injected AssessmentApiClient -- this hook has no
 * opinion on how getNextQuestion picks the next question, but the shipped
 * implementation walks a fixed, admin-approved list rather than branching
 * on performance.
 */
export function useAssessmentSession({
  api,
  userId,
  assessmentDefinitionId,
  maxQuestions,
}: UseAssessmentSessionOptions): UseAssessmentSessionResult {
  const [status, setStatus] = useState<AssessmentSessionStatus>('idle');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [results, setResults] = useState<SubmissionResult[]>([]);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [finalTheta, setFinalTheta] = useState<CompleteSessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptedIdsRef = useRef<string[]>([]);
  // begin() is triggered from a mount effect, which React runs twice in
  // dev StrictMode before re-rendering -- status is still 'idle' both
  // times, so without this every start/questions-next request went out
  // twice. Cleared on failure so a later begin() can retry.
  const beginStartedRef = useRef(false);

  const begin = useCallback(async () => {
    if (beginStartedRef.current) return;
    beginStartedRef.current = true;
    if (!userId) {
      beginStartedRef.current = false;
      setError('Cannot start an assessment without a userId.');
      setStatus('error');
      return;
    }
    setStatus('checking_status');
    setError(null);
    try {
      const statusResult = await api.getStatus(userId, assessmentDefinitionId);
      if (statusResult.isLockedOut) {
        setStatus('locked_out');
        return;
      }

      setStatus('starting');
      const { assessmentId: newAssessmentId, resumedAnswers, questionCount: totalQuestions } = await api.startSession(
        userId,
        assessmentDefinitionId
      );
      setAssessmentId(newAssessmentId);
      setQuestionCount(
        typeof totalQuestions === 'number'
          ? maxQuestions
            ? Math.min(totalQuestions, maxQuestions)
            : totalQuestions
          : null
      );
      // A fresh attempt has no prior answers (resumedAnswers === []), so this
      // is a no-op reset in that case -- the branch only matters when
      // startSession found an existing in_progress attempt and reconstructed
      // its answers instead of starting empty. Without this, every page
      // reload silently restarted the question sequence from question 1,
      // even though the backend already had the real attempt's prior
      // answers on file.
      attemptedIdsRef.current = resumedAnswers.map((r) => r.questionId);
      setResults(resumedAnswers);

      // Mirrors submitCurrent's reachedCap: a resumed attempt whose prior
      // answers already meet maxQuestions must not fetch one more question
      // just because it's the resume path instead of the submit path.
      const reachedCap = Boolean(maxQuestions && resumedAnswers.length >= maxQuestions);
      const nextQuestion = reachedCap
        ? null
        : await api.getNextQuestion(assessmentDefinitionId, attemptedIdsRef.current, resumedAnswers);
      if (!nextQuestion) {
        // Resumed with every question already answered (e.g. the crash
        // happened between the last submitAnswer and completeSession) --
        // finish it now, same completion path submitCurrent uses. This is
        // also the path a brand-new attempt on a zero-active-question
        // assessment takes (resumedAnswers === [], getNextQuestion still
        // returns null): it now completes server-side with passed: null
        // instead of showing "completed" client-only while leaving the
        // attempt in_progress. Intentional -- an attempt record that says
        // completed should mean completed everywhere, not just in the UI.
        const completion = await api.completeSession(newAssessmentId, userId, resumedAnswers, assessmentDefinitionId);
        setFinalTheta(completion);
        setCurrentQuestion(null);
        setStatus('completed');
        return;
      }
      setCurrentQuestion(nextQuestion);
      setStatus('in_progress');
    } catch (err) {
      beginStartedRef.current = false;
      setError(err instanceof Error ? err.message : 'Failed to start assessment.');
      setStatus('error');
    }
  }, [api, userId, assessmentDefinitionId, maxQuestions]);

  const submitCurrent = useCallback(
    async (answer: Answer, timeSpentSeconds: number) => {
      if (!assessmentId || !userId || !currentQuestion) return;
      setStatus('submitting');
      setError(null);
      try {
        const result = await api.submitAnswer({
          assessmentId,
          assessmentDefinitionId,
          userId,
          question: currentQuestion,
          answer,
          timeSpentSeconds,
        });
        const nextResults = [...results, result];
        setResults(nextResults);
        attemptedIdsRef.current = [...attemptedIdsRef.current, currentQuestion.id];

        const reachedCap = Boolean(maxQuestions && nextResults.length >= maxQuestions);
        const nextQuestion = reachedCap
          ? null
          : await api.getNextQuestion(assessmentDefinitionId, attemptedIdsRef.current, nextResults);

        if (!nextQuestion) {
          const completion = await api.completeSession(assessmentId, userId, nextResults, assessmentDefinitionId);
          setFinalTheta(completion);
          setCurrentQuestion(null);
          setStatus('completed');
          return;
        }

        setCurrentQuestion(nextQuestion);
        setStatus('in_progress');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit answer.');
        setStatus('error');
      }
    },
    [api, assessmentDefinitionId, assessmentId, currentQuestion, maxQuestions, results, userId]
  );

  const forceSubmit = useCallback(
    async (reason: string) => {
      if (!assessmentId || !userId) {
        setStatus('locked_out');
        return;
      }
      try {
        await api.invalidateSession(assessmentId, userId, reason, assessmentDefinitionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to invalidate session.');
      } finally {
        setCurrentQuestion(null);
        setStatus('locked_out');
      }
    },
    [api, assessmentDefinitionId, assessmentId, userId]
  );

  useEffect(() => {
    attemptedIdsRef.current = [];
  }, [userId]);

  return { status, assessmentId, currentQuestion, results, questionCount, finalTheta, error, begin, submitCurrent, forceSubmit };
}
