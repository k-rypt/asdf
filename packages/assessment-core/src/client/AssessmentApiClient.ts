import type {
  Answer,
  AssessmentStatus,
  AssessmentTier,
  CompleteSessionResult,
  HeartbeatResult,
  Question,
  StartSessionResult,
  SubmissionResult,
} from '../types';

/**
 * Everything the assessment-core hooks and assessment-ui components need
 * from a backend. Implement this against whatever database/schema a host
 * app uses — the hooks never talk to a database directly.
 */
export interface AssessmentApiClient {
  getStatus(userId: string, assessmentDefinitionId: string): Promise<AssessmentStatus>;

  startSession(userId: string, assessmentDefinitionId: string): Promise<StartSessionResult>;

  /**
   * `assessmentDefinitionId` (assessments.id) is required on every call
   * below that touches assessment-scoped data, not just start/status: a
   * host whose employee can have more than one assessment reachable at
   * once (e.g. two capabilities, each mid-attempt) has no other way to
   * tell the backend which one a given call means. Without it, a host
   * implementation that resolves "the" assessment per-request (rather
   * than from a stable per-session id) can silently resolve the wrong
   * one whenever more than one is in progress -- see
   * rsact_assessment's requireEmployeeAssessmentClient for the
   * reference implementation of that resolution, and the id's absence
   * here (before this comment) for the bug it caused.
   */
  heartbeat(assessmentId: string, userId: string, assessmentDefinitionId: string): Promise<HeartbeatResult>;

  listQuestionIds(): Promise<string[]>;

  getQuestion(questionId: string): Promise<Question>;

  /** Tiers for a yes_no ladder-style assessment (assessment_tiers), ordered by sfiaLevel. Empty for non-ladder assessments. */
  getTiers(assessmentId: string): Promise<AssessmentTier[]>;

  /** Returns the next question from the assessment's fixed, ordered question set, or null when the assessment is complete. Implementations are not expected to branch on performance -- see rsact_assessment's supabase-assessment-api-client for the reference (position-ordered walk over assessment_questions). */
  getNextQuestion(
    assessmentDefinitionId: string,
    attemptedIds: string[],
    results?: SubmissionResult[]
  ): Promise<Question | null>;

  submitAnswer(params: {
    assessmentId: string;
    assessmentDefinitionId: string;
    userId: string;
    question: Question;
    answer: Answer;
    timeSpentSeconds: number;
  }): Promise<SubmissionResult>;

  recordWarning(assessmentId: string, userId: string, warningCount: number): Promise<void>;

  invalidateSession(
    assessmentId: string,
    userId: string,
    reason: string,
    assessmentDefinitionId: string
  ): Promise<void>;

  completeSession(
    assessmentId: string,
    userId: string,
    results: SubmissionResult[],
    assessmentDefinitionId: string
  ): Promise<CompleteSessionResult>;

  /** Optional: report a detected paste event for integrity monitoring. */
  flagPaste?(assessmentId: string, userId: string): Promise<void>;
}

/**
 * Default fetch-based implementation matching devassess-platform's
 * existing route handlers. Host apps with a different schema can either
 * pass a different `baseUrl` (if they keep the same route contracts) or
 * write their own AssessmentApiClient implementation from scratch.
 */
export interface RestApiClientOptions {
  /** Called when any request returns 401 { error: "account_archived" } -- the host's proxy rejected an archived account. */
  onAccountArchived?: () => void;
}

export function createRestApiClient(baseUrl: string = '', options: RestApiClientOptions = {}): AssessmentApiClient {
  const url = (path: string) => `${baseUrl}${path}`;

  async function json<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      if (res.status === 401 && text.includes('"account_archived"')) options.onAccountArchived?.();
      throw new Error(`Request failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async getStatus(userId, assessmentDefinitionId) {
      const res = await fetch(
        url(`/api/assessments/status/${userId}?assessmentDefinitionId=${encodeURIComponent(assessmentDefinitionId)}`)
      );
      return json<AssessmentStatus>(res);
    },

    async startSession(userId, assessmentDefinitionId) {
      const res = await fetch(url('/api/assessments/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, assessmentDefinitionId }),
      });
      return json<StartSessionResult>(res);
    },

    async heartbeat(assessmentId, userId, assessmentDefinitionId) {
      const res = await fetch(url('/api/assessments/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, userId, assessmentDefinitionId }),
      });
      return json<HeartbeatResult>(res);
    },

    async listQuestionIds() {
      const res = await fetch(url('/api/questions'));
      return json<string[]>(res);
    },

    async getQuestion(questionId) {
      const res = await fetch(url(`/api/questions/${questionId}/dynamic`));
      return json<Question>(res);
    },

    async getTiers(assessmentId) {
      const res = await fetch(url(`/api/assessments/${assessmentId}/tiers`));
      return json<AssessmentTier[]>(res);
    },

    async getNextQuestion(assessmentDefinitionId, attemptedIds, results) {
      const res = await fetch(url('/api/questions/next'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentDefinitionId, attemptedIds, results }),
      });
      if (res.status === 204) return null;
      return json<Question | null>(res);
    },

    async submitAnswer({ assessmentId, assessmentDefinitionId, userId, question, answer, timeSpentSeconds }) {
      const res = await fetch(url('/api/submissions/grade'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, assessmentDefinitionId, userId, question, answer, timeSpentSeconds }),
      });
      return json<SubmissionResult>(res);
    },

    async recordWarning(assessmentId, userId, warningCount) {
      const res = await fetch(url('/api/assessments/warnings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, userId, warningCount }),
      });
      if (res.status === 401) await json<never>(res);
      if (!res.ok) throw new Error(`Failed to record warning (${res.status})`);
    },

    async invalidateSession(assessmentId, userId, reason, assessmentDefinitionId) {
      const res = await fetch(url('/api/assessments/invalidate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, userId, reason, assessmentDefinitionId }),
      });
      if (res.status === 401) await json<never>(res);
      if (!res.ok) throw new Error(`Failed to invalidate session (${res.status})`);
    },

    async completeSession(assessmentId, userId, results, assessmentDefinitionId) {
      const res = await fetch(url('/api/assessments/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, userId, results, assessmentDefinitionId }),
      });
      return json<CompleteSessionResult>(res);
    },
  };
}
