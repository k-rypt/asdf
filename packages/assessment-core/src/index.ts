// Main package entry. Client/browser-safe only — no groq-sdk or Node-only
// imports here. Server-side grading lives in `@assessment-toolkit/core/server`.

export type {
  QuestionType,
  QuestionOption,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  YesNoQuestion,
  CodeLanguage,
  CodeQuestion,
  Question,
  MultipleChoiceAnswer,
  YesNoAnswer,
  CodeAnswer,
  Answer,
  AnnotatedCodeEntry,
  StudyGuide,
  SubmissionResult,
  CompleteSessionResult,
  StartSessionResult,
  CompileResult,
  AssessmentStatus,
  HeartbeatResult,
  AssessmentTier,
  TierEvaluationResult,
  TierResult,
} from './types';

export { SFIA_LEVEL_LABELS } from './types';

export type { AssessmentApiClient } from './client/AssessmentApiClient';
export { createRestApiClient } from './client/AssessmentApiClient';
export type { RestApiClientOptions } from './client/AssessmentApiClient';

export { useIntegrityMonitor } from './hooks/useIntegrityMonitor';
export type { IntegrityMonitorOptions, IntegrityMonitorState } from './hooks/useIntegrityMonitor';

export { useHeartbeatTimer } from './hooks/useHeartbeatTimer';
export type { UseHeartbeatTimerOptions, HeartbeatTimerState } from './hooks/useHeartbeatTimer';

export { useElapsedSeconds } from './hooks/useElapsedSeconds';

export { useQuestionAnswer } from './hooks/useQuestionAnswer';
export type { UseQuestionAnswerResult } from './hooks/useQuestionAnswer';

export { useCodeCompiler } from './hooks/useCodeCompiler';
export type { UseCodeCompilerResult } from './hooks/useCodeCompiler';

export { getCodeRunner } from './runners/codeRunner';
export type { CodeRunner, CodeRunnerRegistry } from './runners/codeRunner';
export { createPyodideRunner } from './runners/pyodideRunner';
export type { PyodideRunnerOptions } from './runners/pyodideRunner';

export { useAssessmentSession } from './hooks/useAssessmentSession';
export type {
  AssessmentSessionStatus,
  UseAssessmentSessionOptions,
  UseAssessmentSessionResult,
} from './hooks/useAssessmentSession';
