import Groq from 'groq-sdk';
import type { CodeLanguage, QuestionType } from '../types';
import { callGroqWithFallback, resolveModelCandidates } from './groqModelFallback';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export interface GeneratedQuestionOption {
  text: string;
  isCorrect: boolean;
}

/**
 * One AI-drafted question. Deliberately does NOT include `irt_a` /
 * `irt_b_thresholds` -- those are psychometric calibration parameters
 * derived from real response data over time, not something a model should
 * be inventing from a job description. Everything here is authoring
 * content a human capability lead could equally have typed in by hand;
 * the host app is expected to insert these with `status = 'pending_review'`
 * and `source = 'ai_generated'` for exactly that reason -- nothing here is
 * meant to reach an employee unreviewed.
 */
export interface GeneratedQuestionDraft {
  type: QuestionType;
  title: string;
  description: string;
  constraints?: string;
  /** 1-7, per SFIA. */
  sfiaLevel: number;
  bloomLevel?: BloomLevel;
  tags?: string[];
  expectedConcepts?: string[];
  /** multiple_choice / true_false only. Exactly one entry should have isCorrect: true. */
  options?: GeneratedQuestionOption[];
  /** yes_no only -- which self-assessment tier this belongs to (mirrors sfiaLevel). */
  tierLabel?: string;
  /** code_snippet only. */
  language?: CodeLanguage;
  techDomain?: string;
  starterCode?: string;
  sampleInput?: string;
  sampleOutput?: string;
}

/** Mirrors a row in `assessment_tiers` -- only meaningful when `questions` includes any `yes_no` entries. */
export interface GeneratedTierDraft {
  sfiaLevel: number;
  label: string;
  appliesTo?: string;
  /** 0-1 fraction of "yes" answers required to advance. */
  passThreshold: number;
  advanceMessage?: string;
  stayMessage?: string;
}

export interface GeneratedAssessmentDraft {
  assessmentTitle: string;
  assessmentDescription?: string;
  durationMinutes?: number;
  passingScore: number;
  questionTypeMix: Partial<Record<QuestionType, number>>;
  questions: GeneratedQuestionDraft[];
  /** Only present when `questions` includes `yes_no` entries -- one per distinct sfiaLevel used. */
  tiers?: GeneratedTierDraft[];
  /**
   * Questions the model drafted that `sanitizeDraft` filtered out before
   * they reached `questions`, with a human-readable reason each -- e.g. an
   * out-of-range sfiaLevel or an invalid code_snippet language. Empty when
   * nothing was dropped. Surfacing this lets a caller explain a
   * shorter-than-requested batch instead of the drop being silent.
   */
  droppedQuestions: { title: string; reason: string }[];
}

export interface GenerateAssessmentFromJobDescriptionParams {
  jobDescription: string;
  capabilityName: string;
  capabilityDescription?: string;
  /** Roughly how many questions to draft. Default 8. */
  questionCount?: number;
  /**
   * Which question types the draft may include. Omitted (the default)
   * allows all four types and leaves the self-assessment-ladder decision to
   * the model's own judgment from the job description, same as before this
   * option existed. An explicit array restricts the model (and
   * `sanitizeDraft`, which enforces it regardless of what the model
   * returns) to exactly those types -- e.g. `['yes_no']` for a ladder-only
   * draft, or `['multiple_choice', 'true_false', 'code_snippet']` to
   * exclude the self-assessment ladder entirely.
   */
  allowedTypes?: QuestionType[];
  /**
   * Optional 1-7 SFIA level bounds. When set, the prompt is told to keep
   * every question's `sfiaLevel` within range, and `sanitizeDraft` drops
   * any question that comes back outside it regardless -- a prompt
   * instruction alone isn't something to trust a model to always follow.
   */
  sfiaLevelMin?: number;
  sfiaLevelMax?: number;
  /**
   * Freeform guidance from the capability owner, layered on top of the
   * RULES below rather than replacing them -- e.g. "match the structure of
   * a specific example ladder" or "favor scenario-based questions over
   * trivia". Not persisted anywhere; the caller re-supplies it each time.
   */
  additionalInstructions?: string;
  /** Defaults to process.env.GROQ_API_KEY if omitted. */
  groqApiKey?: string;
  /** See GradeCodeSubmissionParams.model -- same fallback-chain behavior. */
  model?: string;
}

const QUESTION_TYPES: QuestionType[] = ['multiple_choice', 'true_false', 'code_snippet', 'yes_no'];
const CODE_LANGUAGES: CodeLanguage[] = ['java', 'javascript', 'typescript', 'python', 'csharp', 'html_css'];
export const BLOOM_LEVELS: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

/**
 * Drafts a full assessment (metadata + a mixed set of questions) from a
 * free-text job description, targeting a specific capability. Extracted
 * as its own function (rather than folded into gradeCodeSubmission.ts)
 * because it's an authoring-time operation with a completely different
 * shape of output -- persistence, review, and publish are the host app's
 * job, same division of responsibility as gradeCodeSubmission.
 */
export async function generateAssessmentFromJobDescription(
  params: GenerateAssessmentFromJobDescriptionParams
): Promise<GeneratedAssessmentDraft> {
  const {
    jobDescription,
    capabilityName,
    capabilityDescription,
    questionCount: rawQuestionCount = 8,
    allowedTypes,
    sfiaLevelMin,
    sfiaLevelMax,
    additionalInstructions,
    groqApiKey,
    model,
  } = params;

  if (!jobDescription.trim()) {
    throw new Error('generateAssessmentFromJobDescription: jobDescription must not be empty');
  }

  // Clamped here rather than trusted from the caller -- this is the one
  // place the prompt's question count is assembled, so it's the natural
  // spot to enforce the ceiling regardless of which host app/route calls in.
  const questionCount = Math.min(Math.max(Math.round(rawQuestionCount), 1), 25);

  const groq = new Groq({ apiKey: groqApiKey ?? process.env.GROQ_API_KEY });

  const sfiaRangeInstruction =
    sfiaLevelMin != null || sfiaLevelMax != null
      ? `Every question's 'sfiaLevel' MUST be between ${sfiaLevelMin ?? 1} and ${sfiaLevelMax ?? 7} inclusive, regardless of what the job description implies beyond that range.`
      : '';
  const tierRangeHint =
    sfiaLevelMin == null && sfiaLevelMax == null
      ? ' When no explicit SFIA range is given, default the ladder to SFIA levels 2-6 (Assist through Initiate/Influence) unless the job description clearly implies a narrower or different range.'
      : '';
  const isSelfAssessmentOnly = allowedTypes != null && allowedTypes.length === 1 && allowedTypes[0] === 'yes_no';
  const excludedTypes = allowedTypes
    ? (['multiple_choice', 'true_false', 'code_snippet', 'yes_no'] as QuestionType[]).filter(
        (t) => !allowedTypes.includes(t)
      )
    : [];
  const exclusionInstruction =
    excludedTypes.length > 0 ? `Do NOT include any of these question types in this draft: ${excludedTypes.join(', ')}.` : '';

  // Layered on top of the numbered RULES below, never in place of them --
  // an owner asking for "easier questions" shouldn't be able to talk the
  // model out of e.g. rule 7's exactly-one-correct-option requirement.
  const additionalInstructionsBlock = additionalInstructions?.trim()
    ? `\nADDITIONAL INSTRUCTIONS FROM THE CAPABILITY OWNER:\nFollow these as closely as the RULES below allow -- if they conflict with a RULE (e.g. required fields, exactly-one-correct-option, JSON shape), the RULE wins.\n${additionalInstructions.trim()}\n`
    : '';

  const countInstruction = `Draft exactly ${questionCount} questions -- do not stop early. "Approximately" only means the count may come in under ${questionCount} if, after covering every distinct skill/technology/responsibility the job description actually mentions, you run out of genuinely distinct concepts to test (per rule 1) -- treat that as a rare exception, not a default, and keep drafting questions across different aspects of the job description (different technologies, tasks, tools, and seniority levels it mentions) until you reach ${questionCount} or truly exhaust what's testable.`

  const taskInstruction = isSelfAssessmentOnly
    ? `Draft a self-assessment skill ladder for this capability, based on the job description. ${countInstruction} This is NOT a graded test -- do not draft any "multiple_choice", "true_false", or "code_snippet" questions at all, only "yes_no".
- "yes_no": a self-assessment statement ("Can you ...?"), grouped into a tier by sfiaLevel -- these roll up into a pass/fail per tier, not scored individually.
Spread the questions across the tiers covering the seniority range this job description implies (or the SFIA range given below, if one is given), so the ladder actually progresses from foundational to advanced rather than clustering at one level.`
    : `Draft an assessment for this capability, based on the job description. ${countInstruction} Use a realistic mix of question types:
- "multiple_choice": single-best-answer technical question, 4 options, exactly one correct.
- "true_false": a statement to evaluate, 2 options ("True"/"False"), exactly one correct.
- "code_snippet": a hands-on coding exercise. Must include a working language from: ${CODE_LANGUAGES.join(', ')}. Use "html_css" as the language only for markup/styling tasks (graded via static analysis, not execution).
- "yes_no": an ungraded self-assessment statement ("Can you ...?"), grouped into a tier by sfiaLevel -- these roll up into a pass/fail per tier, not scored individually. Only include these if the job description suggests a tiered/ladder-style skill progression is appropriate; otherwise omit this type entirely, and omit "tiers" from the response as well.`

  const prompt = `
[ACT AS A TECHNICAL ASSESSMENT DESIGNER]
You are designing a pre-employment / capability-gap technical assessment from a job description, for a specific capability area. You must draft an assessment definition plus a set of individual questions that together probe the skills that job description actually asks for.

CAPABILITY:
Name: "${capabilityName}"
Description: ${capabilityDescription || 'None provided.'}

JOB DESCRIPTION:
${jobDescription}
${additionalInstructionsBlock}
TASK:
${taskInstruction}

RULES:
1. Every question must be traceable to something in the job description or the capability description -- do not invent unrelated trivia. Do not draft two questions that test essentially the same concept reworded -- each question in the set should probe something distinct.
2. Assign a strict 'sfiaLevel' (1-7) per question based on the seniority/complexity the job description implies for that skill.
3. Assign a 'bloomLevel' from: ${BLOOM_LEVELS.join(', ')}. Vary bloomLevel across the set rather than clustering on one or two levels -- mix recall-level questions with application/analysis-level ones, appropriate to each question's sfiaLevel.
4. 'tags' should be short lowercase keywords (e.g. "arrays", "rest-api", "css-flexbox").
5. 'expectedConcepts' should list specific, gradable concepts a correct answer must demonstrate -- concrete terms or techniques (e.g. "debounce", "index signature"), not a vague restatement of the question itself.
6. For "code_snippet" questions, include a short 'starterCode' scaffold, and 'sampleInput'/'sampleOutput' if the exercise has concrete input/output (omit both if not applicable, e.g. for open-ended design tasks).
7. For "multiple_choice"/"true_false", 'options' must have exactly one entry with isCorrect: true.
8. Derive 'passingScore' (0-100) that is reasonable for the drafted question set${isSelfAssessmentOnly ? '; for a self-assessment ladder, passingScore can be a nominal 100 since scoring is per-tier, not overall' : ''}.
9. 'questionTypeMix' must be an object counting how many questions of each type you actually included (only include keys for types you used).
10. ${isSelfAssessmentOnly ? 'Always return' : 'If you included any "yes_no" questions, also return'} 'tiers': one entry per distinct sfiaLevel used by those questions, ordered lowest sfiaLevel first, each with a 'label' (e.g. "P1 -- Beginner / Follow"), a 'passThreshold' (0-1, default 0.6 unless the job description implies otherwise), and short 'advanceMessage'/'stayMessage' strings. Every "yes_no" question's sfiaLevel must match one of these tiers' sfiaLevel.${tierRangeHint}
${sfiaRangeInstruction ? `11. ${sfiaRangeInstruction}` : ''}
${exclusionInstruction ? `12. ${exclusionInstruction}` : ''}

Return ONLY JSON matching this exact structure:
{
  "assessmentTitle": "string",
  "assessmentDescription": "string",
  "passingScore": 0,
  "questionTypeMix": { "multiple_choice": 0, "true_false": 0, "code_snippet": 0, "yes_no": 0 },
  "tiers": [
    {
      "sfiaLevel": 1,
      "label": "string",
      "appliesTo": "string or omit",
      "passThreshold": 0.6,
      "advanceMessage": "string or omit",
      "stayMessage": "string or omit"
    }
  ],
  "questions": [
    {
      "type": "multiple_choice | true_false | code_snippet | yes_no",
      "title": "string",
      "description": "string",
      "constraints": "string or omit",
      "sfiaLevel": 1,
      "bloomLevel": "remember | understand | apply | analyze | evaluate | create",
      "tags": ["string"],
      "expectedConcepts": ["string"],
      "options": [{ "text": "string", "isCorrect": false }],
      "tierLabel": "string or omit, yes_no only",
      "language": "java | javascript | typescript | python | csharp | html_css, code_snippet only",
      "techDomain": "string or omit",
      "starterCode": "string or omit",
      "sampleInput": "string or omit",
      "sampleOutput": "string or omit"
    }
  ]
}
`;

  const candidates = resolveModelCandidates(model);

  // Groq defaults `max_completion_tokens` to a small cap (observed: 3072)
  // when it's left unset. The gpt-oss fallback models are reasoning models
  // that spend a chunk of that budget on hidden reasoning tokens before
  // writing any JSON (observed: ~1100-1600 reasoning tokens for this
  // prompt), so the default cap was cutting the response off mid-array --
  // `finish_reason: 'length'` -- well short of `questionCount`, silently
  // returning a shorter-but-valid draft instead of erroring. Sized well
  // above what 25 rich questions (worst case: code_snippet, with options/
  // starterCode/sample IO) plus reasoning overhead need, confirmed against
  // the live API.
  const maxCompletionTokens = Math.min(20000, 4000 + questionCount * 600);

  const draft = await callGroqWithFallback(
    candidates,
    '[generateAssessmentFromJobDescription]',
    async (candidate) => {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: candidate,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_completion_tokens: maxCompletionTokens,
      });
      return JSON.parse(completion.choices[0].message.content || '{}') as GeneratedAssessmentDraft;
    }
  );

  return sanitizeDraft(draft, { allowedTypes, sfiaLevelMin, sfiaLevelMax, maxQuestions: questionCount });
}

/**
 * Defensive pass over the model's JSON before it reaches the host app's
 * insert logic -- drops questions with an unrecognized type/language
 * rather than trusting an LLM-produced enum value to always match, and
 * normalizes obviously-malformed multiple_choice/true_false option sets
 * (not exactly one correct answer) rather than silently inserting an
 * ungradable question.
 */
export function sanitizeDraft(
  draft: GeneratedAssessmentDraft,
  options: {
    allowedTypes?: QuestionType[];
    sfiaLevelMin?: number;
    sfiaLevelMax?: number;
    /** Hard cap on the number of questions returned -- see questionCount clamp above; "approximately N" in the prompt is a hint, not a guarantee, so this is enforced here regardless of what the model actually returned. */
    maxQuestions?: number;
  } = {}
): GeneratedAssessmentDraft {
  const { allowedTypes, sfiaLevelMin, sfiaLevelMax, maxQuestions } = options;
  const droppedQuestions: { title: string; reason: string }[] = [];
  let questions: GeneratedQuestionDraft[] = [];

  for (const q of draft.questions ?? []) {
    const title = typeof q?.title === 'string' && q.title.trim() ? q.title.trim() : '(untitled)';

    if (!q || typeof q.title !== 'string' || !q.title.trim()) {
      droppedQuestions.push({ title, reason: 'missing or empty title' });
      continue;
    }
    if (!QUESTION_TYPES.includes(q.type)) {
      droppedQuestions.push({ title, reason: `unrecognized question type "${q.type}"` });
      continue;
    }
    // Enforced regardless of whether the model honored the prompt's SFIA
    // range instruction (see sfiaRangeInstruction in
    // generateAssessmentFromJobDescription) -- same "don't just trust
    // the model" reasoning as the language check below.
    if (typeof q.sfiaLevel === 'number') {
      if (sfiaLevelMin != null && q.sfiaLevel < sfiaLevelMin) {
        droppedQuestions.push({ title, reason: `sfiaLevel ${q.sfiaLevel} is below the requested minimum ${sfiaLevelMin}` });
        continue;
      }
      if (sfiaLevelMax != null && q.sfiaLevel > sfiaLevelMax) {
        droppedQuestions.push({ title, reason: `sfiaLevel ${q.sfiaLevel} is above the requested maximum ${sfiaLevelMax}` });
        continue;
      }
    }
    if (allowedTypes && !allowedTypes.includes(q.type)) {
      droppedQuestions.push({ title, reason: `this question's type is "${q.type}", which isn't in the requested allowedTypes` });
      continue;
    }
    if (q.type === 'code_snippet') {
      // Case-insensitive: the model has been observed returning e.g.
      // "JavaScript" for this field despite the prompt spelling the enum
      // in lowercase, which would otherwise slip past this check only to
      // hit `questions_language_check` at insert time.
      const normalized = typeof q.language === 'string' ? (q.language.toLowerCase() as CodeLanguage) : undefined;
      if (!normalized || !CODE_LANGUAGES.includes(normalized)) {
        droppedQuestions.push({ title, reason: `code_snippet question has a missing/invalid language ("${q.language ?? ''}")` });
        continue;
      }
      q.language = normalized;
    }
    questions.push(q);
  }

  for (const q of questions) {
    if (q.type === 'multiple_choice' || q.type === 'true_false') {
      const correctCount = (q.options ?? []).filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        // Model didn't mark exactly one correct option -- default to the
        // first option rather than inserting a question nothing can pass.
        q.options = (q.options ?? []).map((o, i) => ({ ...o, isCorrect: i === 0 }));
      }
    }
    if (q.bloomLevel && !BLOOM_LEVELS.includes(q.bloomLevel)) {
      q.bloomLevel = undefined;
    }
    // `language` is meaningful for code_snippet only (see the field's doc
    // comment on GeneratedQuestionDraft), but the model has been observed
    // attaching a stray "language" to non-code_snippet questions too (e.g.
    // a multiple_choice question about JS scoping) -- questions_language_check
    // doesn't distinguish by type, so an unfiltered value here fails the
    // insert regardless of whether it's a "valid" language string.
    if (q.type !== 'code_snippet') {
      q.language = undefined;
    }
  }

  // Truncate rather than reject -- "approximately N" in the prompt is a
  // hint the model isn't guaranteed to follow, and this is the one place
  // that enforces the actual ceiling on what gets persisted.
  if (maxQuestions != null && questions.length > maxQuestions) {
    for (const q of questions.slice(maxQuestions)) {
      droppedQuestions.push({ title: q.title, reason: `truncated to stay within the requested count of ${maxQuestions}` });
    }
    questions = questions.slice(0, maxQuestions);
  }

  const yesNoLevels = new Set(questions.filter((q) => q.type === 'yes_no').map((q) => q.sfiaLevel));
  let tiers = (draft.tiers ?? []).filter(
    (t): t is GeneratedTierDraft => typeof t?.sfiaLevel === 'number' && typeof t?.label === 'string' && t.label.trim().length > 0
  );

  // Model omitted `tiers`, or returned yes_no questions whose sfiaLevel
  // doesn't match any tier it defined -- backfill a default tier per
  // orphaned level rather than dropping those questions (they'd otherwise
  // never roll up into a pass/fail, since evaluateYesNoLadder only walks
  // tiers, not raw questions).
  const coveredLevels = new Set(tiers.map((t) => t.sfiaLevel));
  const missingLevels = [...yesNoLevels].filter((lvl) => !coveredLevels.has(lvl)).sort((a, b) => a - b);
  for (const lvl of missingLevels) {
    tiers.push({ sfiaLevel: lvl, label: `SFIA ${lvl}`, passThreshold: 0.6 });
  }
  tiers = tiers.filter((t) => yesNoLevels.has(t.sfiaLevel)).sort((a, b) => a.sfiaLevel - b.sfiaLevel);

  return { ...draft, questions, tiers: tiers.length > 0 ? tiers : undefined, droppedQuestions };
}
