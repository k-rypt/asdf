import { useCallback, useEffect, useState } from 'react';
import type { CodeLanguage, CompileResult } from '../types';
import { getCodeRunner, type CodeRunnerRegistry } from '../runners/codeRunner';

export interface UseCodeCompilerResult {
  /** False when no runner is registered for the language -- hide the Run button. */
  canRun: boolean;
  /** True while the runtime is still loading (show "Preparing…"). */
  isPreparing: boolean;
  isCompiling: boolean;
  result: CompileResult | null;
  compile: (code: string) => Promise<CompileResult>;
  reset: () => void;
}

/**
 * Run Code for the current code question. `language` is null when the
 * current question isn't a code question. The runtime starts loading as
 * soon as a runnable question appears, so it's usually ready by the time
 * the employee presses Run.
 */
export function useCodeCompiler(runners: CodeRunnerRegistry | undefined, language: CodeLanguage | null): UseCodeCompilerResult {
  const runner = language ? getCodeRunner(runners, language) : null;
  const [preloaded, setPreloaded] = useState<ReadonlySet<CodeLanguage>>(() => new Set());
  const [isCompiling, setIsCompiling] = useState(false);
  const [result, setResult] = useState<CompileResult | null>(null);

  useEffect(() => {
    if (!runner || !language) return;
    let cancelled = false;
    runner.preload().then(() => {
      if (!cancelled) setPreloaded((prev) => new Set(prev).add(language));
    });
    return () => {
      cancelled = true;
    };
  }, [runner, language]);

  const compile = useCallback(
    async (code: string) => {
      if (!runner) {
        const unavailable: CompileResult = { success: false, output: 'Running code isn’t available for this language.' };
        setResult(unavailable);
        return unavailable;
      }
      setIsCompiling(true);
      try {
        const res = await runner.run(code);
        setResult(res);
        return res;
      } finally {
        setIsCompiling(false);
      }
    },
    [runner]
  );

  const reset = useCallback(() => setResult(null), []);

  return {
    canRun: Boolean(runner),
    isPreparing: Boolean(runner && language && !preloaded.has(language)),
    isCompiling,
    result,
    compile,
    reset,
  };
}
