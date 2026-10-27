import { useCallback, useState } from 'react';
import type { Answer, Question } from '../types';

function emptyAnswerFor(question: Question | null): Answer | null {
  if (!question) return null;
  if (question.type === 'code_snippet') {
    return { type: 'code_snippet', code: question.starterCode ?? '' };
  }
  if (question.type === 'yes_no') {
    return { type: 'yes_no', value: null };
  }
  return { type: question.type, selectedOptionId: null };
}

/**
 * Whether `answer` is complete enough to submit. For code, untouched
 * starter code isn't an answer (whitespace-only edits don't count
 * either), so Submit stays disabled until they write something.
 */
export function isAnswerComplete(question: Question | null, answer: Answer | null): boolean {
  if (!answer) return false;
  if (answer.type === 'code_snippet') {
    const code = answer.code.trim();
    if (code.length === 0) return false;
    const starter = question?.type === 'code_snippet' ? (question.starterCode ?? '').trim() : '';
    return starter.length === 0 || code !== starter;
  }
  if (answer.type === 'yes_no') return answer.value !== null;
  return answer.selectedOptionId !== null;
}

export interface UseQuestionAnswerResult {
  answer: Answer | null;
  setSelectedOptionId: (optionId: string) => void;
  setYesNoValue: (value: boolean) => void;
  setCode: (code: string) => void;
  isAnswered: boolean;
}

/**
 * Normalizes local answer state for whichever question type is currently
 * displayed, resetting whenever the question itself changes.
 */
export function useQuestionAnswer(question: Question | null): UseQuestionAnswerResult {
  const [answer, setAnswer] = useState<Answer | null>(() => emptyAnswerFor(question));
  const [answerFor, setAnswerFor] = useState(question);

  // Reset during render rather than in an effect, so the new question
  // never renders for a frame with the previous question's answer.
  if (question !== answerFor) {
    setAnswerFor(question);
    setAnswer(emptyAnswerFor(question));
  }

  const setSelectedOptionId = useCallback((optionId: string) => {
    setAnswer((prev) => {
      if (!prev || (prev.type !== 'multiple_choice' && prev.type !== 'true_false')) return prev;
      return { ...prev, selectedOptionId: optionId };
    });
  }, []);

  const setYesNoValue = useCallback((value: boolean) => {
    setAnswer((prev) => {
      if (!prev || prev.type !== 'yes_no') return prev;
      return { ...prev, value };
    });
  }, []);

  const setCode = useCallback((code: string) => {
    setAnswer((prev) => {
      if (!prev || prev.type !== 'code_snippet') return prev;
      return { ...prev, code };
    });
  }, []);

  const isAnswered = isAnswerComplete(question, answer);

  return { answer, setSelectedOptionId, setYesNoValue, setCode, isAnswered };
}
