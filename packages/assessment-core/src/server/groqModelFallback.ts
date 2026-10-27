/**
 * Built-in fallback chain, used only when neither a caller-supplied model
 * nor GROQ_MODEL is set. Keep this updated occasionally, but the point of
 * the fallback chain (and GROQ_MODEL) is that a single Groq deprecation
 * between now and go-live doesn't require a code change -- just an env var,
 * or nothing at all if one of these still resolves.
 *
 * Shared by every Groq-backed function in this package (gradeCodeSubmission,
 * generateAssessmentFromJobDescription, ...) -- extracted here so the
 * candidate-resolution + retry-on-404 loop isn't duplicated per call site.
 */
export const DEFAULT_MODEL_FALLBACKS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound'];

export function resolveModelCandidates(explicitModel?: string): string[] {
  if (explicitModel) return [explicitModel];
  const envModels = process.env.GROQ_MODEL;
  if (envModels) {
    const parsed = envModels
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_MODEL_FALLBACKS;
}

/**
 * Runs `call` against each candidate model in order. Falls through to the
 * next candidate only when Groq reports the model itself is gone (404 --
 * decommissioned/unknown model id); any other failure (bad request, rate
 * limit, auth, content policy, etc.) surfaces immediately instead of being
 * masked by more retries.
 */
export async function callGroqWithFallback<T>(
  candidates: string[],
  logPrefix: string,
  call: (model: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await call(candidate);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status !== 404) throw err;
      console.warn(`${logPrefix} Groq model "${candidate}" unavailable, trying next fallback...`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${logPrefix}: all Groq model candidates failed`);
}
