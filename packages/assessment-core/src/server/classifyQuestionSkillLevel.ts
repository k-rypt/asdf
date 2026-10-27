import Groq from 'groq-sdk';
import type { QuestionType } from '../types';
import { SFIA_LEVEL_LABELS } from '../types';
import { callGroqWithFallback, resolveModelCandidates } from './groqModelFallback';
import { BLOOM_LEVELS, type BloomLevel } from './generateAssessmentFromJobDescription';

export interface ClassifyQuestionSkillLevelParams {
  title: string;
  description: string;
  type: QuestionType;
  constraints?: string;
  capabilityName: string;
  capabilityDescription?: string;
  /** Defaults to process.env.GROQ_API_KEY if omitted. */
  groqApiKey?: string;
  /** Same fallback-chain semantics as gradeCodeSubmission's `model` param -- see groqModelFallback.ts. */
  model?: string;
}

export interface QuestionSkillLevelClassification {
  /** 1-7, per SFIA. */
  sfiaLevel: number;
  bloomLevel: BloomLevel;
}

/**
 * Classifies a manually-authored question's difficulty (SFIA level) and
 * cognitive demand (Bloom level) after the fact -- the same two fields
 * generateAssessmentFromJobDescription's model already assigns per
 * question during a full drafting pass, just as a standalone call for
 * the manual-question-creation route (see app/api/admin/capabilities/
 * [capability]/questions/route.ts), which never asks an admin to guess
 * either field.
 *
 * Throws on a missing/malformed response rather than substituting a
 * guessed default -- the caller decides how to degrade. The manual-
 * creation route's answer: leave both fields null and flag the response,
 * since the question itself is already durable by the time this runs.
 */
export async function classifyQuestionSkillLevel(
  params: ClassifyQuestionSkillLevelParams
): Promise<QuestionSkillLevelClassification> {
  const { title, description, type, constraints, capabilityName, capabilityDescription, groqApiKey, model } = params;
  const groq = new Groq({ apiKey: groqApiKey ?? process.env.GROQ_API_KEY });

  const sfiaLevelGuide = Object.entries(SFIA_LEVEL_LABELS)
    .map(([level, label]) => `${level} ${label}`)
    .join(', ');

  const prompt = `You are classifying a technical assessment question for the "${capabilityName}" capability${
    capabilityDescription ? ` (${capabilityDescription})` : ''
  }.

Question type: ${type}
Title: ${title}
Description: ${description}
${constraints ? `Constraints: ${constraints}\n` : ''}
Assign:
1. 'sfiaLevel': an integer 1-7 per SFIA responsibility levels -- ${sfiaLevelGuide}. Judge by how much independent judgement/responsibility answering this question well would demonstrate, not by topic difficulty alone.
2. 'bloomLevel': one of ${BLOOM_LEVELS.join(', ')}, per Bloom's taxonomy -- what cognitive skill answering this question actually exercises.

Respond with ONLY a JSON object: {"sfiaLevel": <integer 1-7>, "bloomLevel": "<one of the levels above>"}`;

  const candidates = resolveModelCandidates(model);
  const completion = await callGroqWithFallback(candidates, '[classifyQuestionSkillLevel]', (candidateModel) =>
    groq.chat.completions.create({
      model: candidateModel,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })
  );

  const raw = JSON.parse(completion.choices[0].message.content || '{}') as {
    sfiaLevel?: unknown;
    bloomLevel?: unknown;
  };

  const sfiaLevel = Number(raw.sfiaLevel);
  if (!Number.isInteger(sfiaLevel) || sfiaLevel < 1 || sfiaLevel > 7) {
    throw new Error(`classifyQuestionSkillLevel: model returned an invalid sfiaLevel (${JSON.stringify(raw.sfiaLevel)})`);
  }

  const bloomLevel = raw.bloomLevel as BloomLevel;
  if (!BLOOM_LEVELS.includes(bloomLevel)) {
    throw new Error(`classifyQuestionSkillLevel: model returned an invalid bloomLevel (${JSON.stringify(raw.bloomLevel)})`);
  }

  return { sfiaLevel, bloomLevel };
}
