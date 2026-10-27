import { describe, expect, it } from 'vitest';
import { isAnswerComplete } from './useQuestionAnswer';
import type { CodeQuestion, MultipleChoiceQuestion, YesNoQuestion } from '../types';

const code: CodeQuestion = {
  id: 'q1',
  type: 'code_snippet',
  title: 'Palindrome',
  description: '',
  language: 'python',
  starterCode: 'def is_palindrome(s):\n    pass',
};
const mcq: MultipleChoiceQuestion = {
  id: 'q2',
  type: 'multiple_choice',
  title: 'Lists vs Tuples',
  description: '',
  options: [{ id: 'a', text: 'A' }],
};
const yesNo: YesNoQuestion = { id: 'q3', type: 'yes_no', title: 'Can you?', description: '', sfiaLevel: 2 };

describe('isAnswerComplete', () => {
  it('is false for untouched starter code', () => {
    expect(isAnswerComplete(code, { type: 'code_snippet', code: code.starterCode! })).toBe(false);
  });

  it('is false when only whitespace around the starter code changed', () => {
    expect(isAnswerComplete(code, { type: 'code_snippet', code: `\n  ${code.starterCode}  \n` })).toBe(false);
  });

  it('is true once the starter code is edited', () => {
    expect(
      isAnswerComplete(code, { type: 'code_snippet', code: 'def is_palindrome(s):\n    return s == s[::-1]' })
    ).toBe(true);
  });

  it('is false for empty code', () => {
    expect(isAnswerComplete({ ...code, starterCode: undefined }, { type: 'code_snippet', code: '   ' })).toBe(false);
  });

  it('is true for any non-empty code when there is no starter code', () => {
    expect(isAnswerComplete({ ...code, starterCode: undefined }, { type: 'code_snippet', code: 'print(1)' })).toBe(
      true
    );
  });

  it('requires a selected option for multiple choice', () => {
    expect(isAnswerComplete(mcq, { type: 'multiple_choice', selectedOptionId: null })).toBe(false);
    expect(isAnswerComplete(mcq, { type: 'multiple_choice', selectedOptionId: 'a' })).toBe(true);
  });

  it('requires a yes or no choice', () => {
    expect(isAnswerComplete(yesNo, { type: 'yes_no', value: null })).toBe(false);
    expect(isAnswerComplete(yesNo, { type: 'yes_no', value: false })).toBe(true);
  });

  it('is false with no question or answer', () => {
    expect(isAnswerComplete(null, null)).toBe(false);
  });
});
