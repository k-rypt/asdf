import type { Answer, CompileResult, Question } from '@assessment-toolkit/core';
import { MultipleChoiceCard } from './cards/MultipleChoiceCard';
import { YesNoCard } from './cards/YesNoCard';
import { CodeExerciseCard } from './cards/CodeExerciseCard';

export interface QuestionRendererProps {
  question: Question;
  answer: Answer | null;
  onSelectOption: (optionId: string) => void;
  onSelectYesNo: (value: boolean) => void;
  onCodeChange: (code: string) => void;
  onCompile: () => void;
  canRun: boolean;
  isPreparing: boolean;
  isCompiling: boolean;
  compileResult: CompileResult | null;
  disabled?: boolean;
}

/** Switches between the MCQ/true-false card, the yes/no ladder card, and the code exercise card based on `question.type`. */
export function QuestionRenderer({
  question,
  answer,
  onSelectOption,
  onSelectYesNo,
  onCodeChange,
  onCompile,
  canRun,
  isPreparing,
  isCompiling,
  compileResult,
  disabled,
}: QuestionRendererProps) {
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    const selectedOptionId = answer && answer.type !== 'code_snippet' && answer.type !== 'yes_no' ? answer.selectedOptionId : null;
    return (
      <MultipleChoiceCard
        question={question}
        selectedOptionId={selectedOptionId}
        onSelect={onSelectOption}
        disabled={disabled}
      />
    );
  }

  if (question.type === 'yes_no') {
    const value = answer && answer.type === 'yes_no' ? answer.value : null;
    return (
      <YesNoCard
        question={question}
        value={value}
        onSelect={onSelectYesNo}
        disabled={disabled}
      />
    );
  }

  const code = answer && answer.type === 'code_snippet' ? answer.code : question.starterCode ?? '';
  return (
    <CodeExerciseCard
      question={question}
      code={code}
      onChange={onCodeChange}
      onCompile={onCompile}
      canRun={canRun}
      isPreparing={isPreparing}
      isCompiling={isCompiling}
      compileResult={compileResult}
      disabled={disabled}
    />
  );
}
