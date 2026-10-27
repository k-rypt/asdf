import type { CodeLanguage, CompileResult } from '../types';

/**
 * Runs a code answer for the "Run Code" button. Each language gets its
 * own runner behind this one contract (in-browser Pyodide for Python
 * today; a server sandbox could back compiled languages later), so the
 * card and the grading flow never care which language they're handling.
 */
export interface CodeRunner {
  /** Starts loading the runtime ahead of the first run. Never rejects. */
  preload(): Promise<void>;
  /** Runs the code. Never rejects -- failures come back as `success: false`. */
  run(code: string): Promise<CompileResult>;
}

/** Runners by language. A language with no entry has no Run button. */
export type CodeRunnerRegistry = Partial<Record<CodeLanguage, CodeRunner>>;

export function getCodeRunner(registry: CodeRunnerRegistry | undefined, language: CodeLanguage): CodeRunner | null {
  return registry?.[language] ?? null;
}
