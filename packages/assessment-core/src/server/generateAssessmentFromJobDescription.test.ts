import { describe, expect, it } from 'vitest';
import { sanitizeDraft, type GeneratedAssessmentDraft, type GeneratedQuestionDraft } from './generateAssessmentFromJobDescription';
import type { QuestionType } from '../types';

function draftWith(types: string[]): GeneratedAssessmentDraft {
  return {
    assessmentTitle: 'Test Assessment',
    assessmentDescription: 'desc',
    durationMinutes: 30,
    passingScore: 70,
    questionTypeMix: {},
    questions: types.map((type, i) => ({
      type: type as QuestionType,
      title: `Question ${i}`,
      description: 'desc',
      sfiaLevel: 3,
      ...(type === 'code_snippet' ? { language: 'javascript' as const } : {}),
    })) as GeneratedQuestionDraft[],
    tiers: types.includes('yes_no')
      ? [{ sfiaLevel: 3, label: 'P3', passThreshold: 0.6 }]
      : [],
    droppedQuestions: [],
  };
}

describe('sanitizeDraft allowedTypes filtering', () => {
  it('keeps every type when allowedTypes is omitted', () => {
    const draft = draftWith(['multiple_choice', 'true_false', 'code_snippet', 'yes_no']);
    const result = sanitizeDraft(draft, {});
    expect(result.questions.map((q) => q.type)).toEqual([
      'multiple_choice',
      'true_false',
      'code_snippet',
      'yes_no',
    ]);
    expect(result.droppedQuestions).toEqual([]);
  });

  it('keeps only yes_no when allowedTypes is ["yes_no"]', () => {
    const draft = draftWith(['multiple_choice', 'yes_no', 'code_snippet']);
    const result = sanitizeDraft(draft, { allowedTypes: ['yes_no'] });
    expect(result.questions.map((q) => q.type)).toEqual(['yes_no']);
    expect(result.droppedQuestions.length).toBe(2);
  });

  it('drops yes_no (and its tiers) when allowedTypes excludes it', () => {
    const draft = draftWith(['multiple_choice', 'true_false', 'yes_no']);
    const result = sanitizeDraft(draft, {
      allowedTypes: ['multiple_choice', 'true_false', 'code_snippet'],
    });
    expect(result.questions.map((q) => q.type)).toEqual(['multiple_choice', 'true_false']);
    expect(result.droppedQuestions.length).toBe(1);
  });

  it('drops exactly one graded type while keeping the others and yes_no -- not expressible by the old two-flag system', () => {
    const draft = draftWith(['multiple_choice', 'true_false', 'code_snippet', 'yes_no']);
    const result = sanitizeDraft(draft, {
      allowedTypes: ['multiple_choice', 'true_false', 'yes_no'],
    });
    expect(result.questions.map((q) => q.type)).toEqual(['multiple_choice', 'true_false', 'yes_no']);
    expect(result.droppedQuestions.length).toBe(1);
    expect(result.droppedQuestions[0].reason).toContain('code_snippet');
  });

  it('drops every question when allowedTypes is an empty array', () => {
    const draft = draftWith(['multiple_choice', 'yes_no']);
    const result = sanitizeDraft(draft, { allowedTypes: [] });
    expect(result.questions).toEqual([]);
    expect(result.droppedQuestions.length).toBe(2);
  });
});
