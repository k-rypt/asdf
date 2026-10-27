import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  AssessmentApiClient,
  CodeRunnerRegistry,
  CompleteSessionResult,
  SubmissionResult,
} from '@assessment-toolkit/core';
import {
  useAssessmentSession,
  useCodeCompiler,
  useElapsedSeconds,
  useQuestionAnswer,
} from '@assessment-toolkit/core';
import { QuestionRenderer } from './QuestionRenderer';
import { IntegrityShell } from './shell/IntegrityShell';

export interface AssessmentContainerProps {
  api: AssessmentApiClient;
  /** Resolved by the host app (e.g. from its own auth/session), not by this component. */
  userId: string | null;
  /** assessments.id -- which assessment definition to start/resume. Resolved by the host app (e.g. from a route param), not by this component. */
  assessmentDefinitionId: string;
  questionCount?: number;
  maxWarnings?: number;
  /** Run Code runners by language (e.g. in-browser Python). Languages without one get no Run button. */
  codeRunners?: CodeRunnerRegistry;
  renderFinalReport: (results: SubmissionResult[], theta: CompleteSessionResult | null) => ReactNode;
  renderLockedOut: (reason: string) => ReactNode;
}

/**
 * Top-level component. Accepts `api` and `userId` as props — it never
 * resolves auth or talks to a database itself, so it drops into any host
 * app regardless of that app's schema, as long as an AssessmentApiClient
 * is provided.
 */
export function AssessmentContainer({
  api,
  userId,
  assessmentDefinitionId,
  questionCount,
  maxWarnings = 3,
  codeRunners,
  renderFinalReport,
  renderLockedOut,
}: AssessmentContainerProps) {
  const session = useAssessmentSession({ api, userId, assessmentDefinitionId, maxQuestions: questionCount });
  const { answer, setSelectedOptionId, setYesNoValue, setCode, isAnswered } = useQuestionAnswer(
    session.currentQuestion
  );
  const codeLanguage = session.currentQuestion?.type === 'code_snippet' ? session.currentQuestion.language : null;
  const { canRun, isPreparing, isCompiling, result: compileResult, compile } = useCodeCompiler(codeRunners, codeLanguage);
  const elapsedSeconds = useElapsedSeconds(session.currentQuestion?.id ?? null);

  useEffect(() => {
    if (session.status === 'idle') session.begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  if (session.status === 'locked_out') {
    return <>{renderLockedOut('This assessment session has been locked.')}</>;
  }

  if (session.status === 'completed') {
    return <>{renderFinalReport(session.results, session.finalTheta)}</>;
  }

  if (session.status === 'error') {
    return (
      <div className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground">{session.error}</p>
      </div>
    );
  }

  if (!session.currentQuestion) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-muted-foreground">
        Loading assessment…
      </div>
    );
  }

  const handleCompile = () => {
    if (session.currentQuestion?.type === 'code_snippet' && answer?.type === 'code_snippet') {
      compile(answer.code);
    }
  };

  const handleSubmit = () => {
    if (!answer || !isAnswered) return;
    const finalAnswer =
      answer.type === 'code_snippet' ? { ...answer, compilationOutput: compileResult?.output } : answer;
    session.submitCurrent(finalAnswer, elapsedSeconds);
  };

  return (
    <IntegrityShell
      api={api}
      assessmentId={session.assessmentId}
      userId={userId}
      assessmentDefinitionId={assessmentDefinitionId}
      questionIndex={session.results.length}
      questionCount={session.questionCount ?? questionCount}
      maxWarnings={maxWarnings}
      onLockout={(reason) => session.forceSubmit(reason)}
      onExpired={() => session.forceSubmit('Time expired.')}
    >
      <QuestionRenderer
        question={session.currentQuestion}
        answer={answer}
        onSelectOption={setSelectedOptionId}
        onSelectYesNo={setYesNoValue}
        onCodeChange={setCode}
        onCompile={handleCompile}
        canRun={canRun}
        isPreparing={isPreparing}
        isCompiling={isCompiling}
        compileResult={compileResult}
        disabled={session.status === 'submitting'}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={session.status === 'submitting' || !isAnswered}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
        >
          {session.status === 'submitting' ? 'Submitting…' : 'Submit Answer'}
        </button>
      </div>
    </IntegrityShell>
  );
}
