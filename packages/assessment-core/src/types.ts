// --- SFIA Levels -------------------------------------------------------

export const SFIA_LEVEL_LABELS: Record<number, string> = {
  1: 'Follow',
  2: 'Assist',
  3: 'Apply',
  4: 'Enable',
  5: 'Ensure/Advise',
  6: 'Initiate/Influence',
  7: 'Set Strategy',
};

// --- Questions ---------------------------------------------------------

export type QuestionType = 'multiple_choice' | 'true_false' | 'code_snippet' | 'yes_no';

export interface QuestionOption {
  id: string;
  text: string;
}

interface QuestionBase {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  constraints?: string;
  points?: number;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  options: QuestionOption[];
  // Deliberately no `correctOptionId` here — that must never reach the
  // client. Keep it server-side only, in your own repository layer.
}

/** Graded binary question (has a correct answer), rendered like a 2-option MultipleChoiceCard. */
export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false';
  options: QuestionOption[]; // same "no correctOptionId on the client" rule as MultipleChoiceQuestion
}

/**
 * Ungraded self-report question — part of a tiered assessment ladder
 * (e.g. "Can you create a basic HTML page structure?"). There is no
 * correct answer; the employee's own yes/no answers roll up into a
 * per-tier pass/fail via evaluateYesNoTier (see the server package).
 */
export interface YesNoQuestion extends QuestionBase {
  type: 'yes_no';
  /** Which tier (assessment_tiers.sfia_level) this question belongs to. */
  sfiaLevel: number;
  /** e.g. "P1 -- Beginner / Follow", for display grouping. */
  tierLabel?: string;
}

export type CodeLanguage =
  | 'java'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'csharp'
  | 'html_css';

export interface CodeQuestion extends QuestionBase {
  type: 'code_snippet';
  language: CodeLanguage;
  /** e.g. 'html_css' switches the UI into the live-preview branch instead of a compiler console. */
  techDomain?: string;
  starterCode?: string;
}

export type Question = MultipleChoiceQuestion | TrueFalseQuestion | YesNoQuestion | CodeQuestion;

// --- Answers -------------------------------------------------------------

export interface MultipleChoiceAnswer {
  type: 'multiple_choice' | 'true_false';
  selectedOptionId: string | null;
}

export interface YesNoAnswer {
  type: 'yes_no';
  value: boolean | null;
}

export interface CodeAnswer {
  type: 'code_snippet';
  code: string;
  compilationOutput?: string;
}

export type Answer = MultipleChoiceAnswer | YesNoAnswer | CodeAnswer;

// --- Grading / results -----------------------------------------------------

export interface AnnotatedCodeEntry {
  codeSnippet: string;
  improvement: string;
}

export interface StudyGuide {
  title: string;
  url: string;
}

export interface SubmissionResult {
  questionId: string;
  questionTitle: string;
  totalScore: number;
  displayLevel?: string;
  displayLevelDescription?: string;
  feedback?: string;
  chainOfThought?: string;
  subScores?: {
    correctness: number;
    quality: number;
    edgeCases: number;
    bestPractice: number;
  };
  annotatedCode?: AnnotatedCodeEntry[];
  guides?: StudyGuide[];
  sfiaLevelAssigned?: number;
  knowledgeGaps?: string[];
  timeSpentSeconds: number;
  /** Present only when the source question was type 'yes_no' -- there is no score, just the raw answer. */
  yesNoValue?: boolean;
}

/** What completeSession resolves with -- the ability estimate computed for this attempt, if any calibrated items were answered. */
export interface CompleteSessionResult {
  thetaEstimate: number | null
  thetaSe: number | null
  tierResult: TierResult | null
}

/** What startSession resolves with. `resumedAnswers` is empty for a brand-new attempt, and populated (in question order) when an existing in_progress attempt was found instead of creating a new one. */
export interface StartSessionResult {
  assessmentId: string
  resumedAnswers: SubmissionResult[]
  /** Active questions in this assessment, for "Question X of Y". Optional so hosts that can't cheaply count simply omit the total. A yes/no ladder can end before reaching it. */
  questionCount?: number
}

// --- Compilation -----------------------------------------------------------

export interface CompileResult {
  success: boolean;
  output: string;
  exitCode?: number;
  isVisual?: boolean;
}

// --- Session status --------------------------------------------------------

export interface AssessmentStatus {
  isLockedOut: boolean;
  infractionCount: number;
}

export interface HeartbeatResult {
  success: boolean;
  expired?: boolean;
  timeLeft?: number;
}

// --- Yes/no self-assessment ladder ------------------------------------------

/** Mirrors a row in `assessment_tiers`. */
export interface AssessmentTier {
  sfiaLevel: number;
  label: string;
  appliesTo?: string;
  /** 0-1 fraction of "yes" answers required to advance (e.g. 0.6 for "60% / most"). */
  passThreshold: number;
  advanceMessage?: string;
  stayMessage?: string;
}

export interface TierEvaluationResult {
  sfiaLevel: number;
  label: string;
  passed: boolean;
  yesCount: number;
  totalCount: number;
  message?: string;
}

export interface TierResult {
  achievedSfiaLevel: number;
  message?: string;
  tiers: TierEvaluationResult[];
}
