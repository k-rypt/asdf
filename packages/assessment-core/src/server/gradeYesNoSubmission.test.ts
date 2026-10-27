import { describe, expect, it } from 'vitest';
import { achievedTierFromTierResult, buildTierResult, evaluateYesNoLadder, evaluateYesNoTier, shouldHaltAfterAnswer } from './gradeYesNoSubmission';
import type { AssessmentTier, SubmissionResult } from '../types';

const tiers: AssessmentTier[] = [
  { sfiaLevel: 2, label: 'P2 -- Assist', passThreshold: 0.6, advanceMessage: 'Advance to P3', stayMessage: 'Stay at P2' },
  { sfiaLevel: 3, label: 'P3 -- Apply', passThreshold: 0.6, advanceMessage: 'Advance to P4', stayMessage: 'Stay at P3' },
  { sfiaLevel: 4, label: 'P4 -- Enable', passThreshold: 0.6, advanceMessage: 'Advance to P5', stayMessage: 'Stay at P4' },
];

describe('evaluateYesNoTier', () => {
  it('passes when the yes ratio meets the threshold', () => {
    const result = evaluateYesNoTier(tiers[0], [true, true, false]);
    expect(result.passed).toBe(true);
    expect(result.message).toBe('Advance to P3');
  });

  it('fails when the yes ratio is below the threshold', () => {
    const result = evaluateYesNoTier(tiers[0], [true, false, false]);
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Stay at P2');
  });
});

describe('evaluateYesNoLadder', () => {
  it('stops at the first tier that fails and does not evaluate higher tiers', () => {
    const answersByTier = new Map<number, boolean[]>([
      [2, [true, true]],
      [3, [false, false]],
      [4, [true, true]],
    ]);
    const results = evaluateYesNoLadder(tiers, answersByTier);
    expect(results.map((r) => r.sfiaLevel)).toEqual([2, 3]);
    expect(results[1].passed).toBe(false);
  });

  it('evaluates every tier when all of them pass', () => {
    const answersByTier = new Map<number, boolean[]>([
      [2, [true, true]],
      [3, [true, true]],
      [4, [true, true]],
    ]);
    const results = evaluateYesNoLadder(tiers, answersByTier);
    expect(results.map((r) => r.sfiaLevel)).toEqual([2, 3, 4]);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});

describe('buildTierResult', () => {
  it('reports the highest passed tier and the final (failing) tier message', () => {
    const answersByTier = new Map<number, boolean[]>([
      [2, [true, true]],
      [3, [false, false]],
    ]);
    const result = buildTierResult(tiers, answersByTier);
    expect(result.achievedSfiaLevel).toBe(2);
    expect(result.message).toBe('Stay at P3');
    expect(result.tiers.map((t) => t.sfiaLevel)).toEqual([2, 3]);
  });

  it('reports achievedSfiaLevel 0 when the very first tier fails', () => {
    const answersByTier = new Map<number, boolean[]>([[2, [false, false]]]);
    const result = buildTierResult(tiers, answersByTier);
    expect(result.achievedSfiaLevel).toBe(0);
  });

  it('skips a tier with no active yes/no questions instead of failing the ladder there', () => {
    const answersByTier = new Map<number, boolean[]>([
      [2, [true, true]],
      [4, [true, true]],
    ]);
    // Tier 3 has no answers and is excluded via activeSfiaLevels -- without
    // the fix this would be scored as an automatic fail (ratio 0) and break
    // the ladder before tier 4 is ever evaluated.
    const result = buildTierResult(tiers, answersByTier, new Set([2, 4]));
    expect(result.achievedSfiaLevel).toBe(4);
    expect(result.tiers.map((t) => t.sfiaLevel)).toEqual([2, 4]);
  });
});

describe('achievedTierFromTierResult', () => {
  it('returns null when achievedSfiaLevel is 0', () => {
    expect(achievedTierFromTierResult({ achievedSfiaLevel: 0, tiers: [] })).toBeNull();
  });

  it('names a stop below the first level after that level', () => {
    expect(
      achievedTierFromTierResult({
        achievedSfiaLevel: 0,
        message: 'Stay at P1 or recommend foundational training',
        tiers: [{ sfiaLevel: 1, label: 'P1 – Beginner / Follow', passed: false, yesCount: 1, totalCount: 5 }],
      })
    ).toEqual({ sfiaLevel: 0, label: 'Below P1' });
  });

  it('returns null for a null or undefined tierResult', () => {
    expect(achievedTierFromTierResult(null)).toBeNull();
    expect(achievedTierFromTierResult(undefined)).toBeNull();
  });

  it('returns the matching tier sfiaLevel and label', () => {
    const tierResult = buildTierResult(tiers, new Map([[2, [true, true]], [3, [true, true]], [4, [false, false]]]));
    expect(achievedTierFromTierResult(tierResult)).toEqual({ sfiaLevel: 3, label: 'P3 -- Apply' });
  });

  it('reads the legacy snake_case achieved_sfia_level key from rows written before the camelCase refactor', () => {
    const legacyTierResult = {
      achieved_sfia_level: 3,
      tiers: [
        { sfiaLevel: 2, label: 'P2 -- Assist', passed: true, yesCount: 2, totalCount: 2, message: 'Advance to P3' },
        { sfiaLevel: 3, label: 'P3 -- Apply', passed: true, yesCount: 2, totalCount: 2, message: 'Advance to P4' },
      ],
    } as unknown as Parameters<typeof achievedTierFromTierResult>[0];
    expect(achievedTierFromTierResult(legacyTierResult)).toEqual({ sfiaLevel: 3, label: 'P3 -- Apply' });
  });
});

function yesNoResult(questionId: string, yesNoValue: boolean): SubmissionResult {
  return {
    questionId,
    questionTitle: questionId,
    totalScore: 0,
    feedback: '',
    timeSpentSeconds: 0,
    yesNoValue,
  };
}

describe('shouldHaltAfterAnswer', () => {
  const yesNoQuestions = [
    { id: 'q2a', sfiaLevel: 2 },
    { id: 'q2b', sfiaLevel: 2 },
    { id: 'q3a', sfiaLevel: 3 },
    { id: 'q3b', sfiaLevel: 3 },
  ];

  it('returns false while a tier still has unanswered questions', () => {
    const halted = shouldHaltAfterAnswer({
      tiers,
      yesNoQuestions,
      attemptedIds: ['q2a'],
      results: [yesNoResult('q2a', true)],
    });
    expect(halted).toBe(false);
  });

  it('returns true the moment the last question of a failed tier is answered', () => {
    const halted = shouldHaltAfterAnswer({
      tiers,
      yesNoQuestions,
      attemptedIds: ['q2a', 'q2b'],
      results: [yesNoResult('q2a', false), yesNoResult('q2b', false)],
    });
    expect(halted).toBe(true);
  });

  it('returns false when the whole ladder completes with every tier passed', () => {
    const halted = shouldHaltAfterAnswer({
      tiers,
      yesNoQuestions,
      attemptedIds: ['q2a', 'q2b', 'q3a', 'q3b'],
      results: [
        yesNoResult('q2a', true),
        yesNoResult('q2b', true),
        yesNoResult('q3a', true),
        yesNoResult('q3b', true),
      ],
    });
    expect(halted).toBe(false);
  });

  it('matches tier membership by sfiaLevel even when questions arrive out of tier order', () => {
    const shuffledQuestions = [
      { id: 'q3a', sfiaLevel: 3 },
      { id: 'q2a', sfiaLevel: 2 },
      { id: 'q3b', sfiaLevel: 3 },
      { id: 'q2b', sfiaLevel: 2 },
    ];
    const halted = shouldHaltAfterAnswer({
      tiers,
      yesNoQuestions: shuffledQuestions,
      attemptedIds: ['q2a', 'q2b'],
      results: [yesNoResult('q2a', false), yesNoResult('q2b', false)],
    });
    expect(halted).toBe(true);
  });
});
