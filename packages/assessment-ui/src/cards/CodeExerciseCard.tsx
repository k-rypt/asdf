import { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import type { CodeLanguage, CodeQuestion, CompileResult } from '@assessment-toolkit/core';

/** Maps our CodeLanguage union onto Monaco's language ids. */
const MONACO_LANGUAGE_MAP: Record<CodeLanguage, string> = {
  java: 'java',
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  csharp: 'csharp',
  html_css: 'html',
};

export interface CodeExerciseCardProps {
  question: CodeQuestion;
  code: string;
  onChange: (code: string) => void;
  onCompile: () => void;
  /** False when no runner exists for this language -- the Run button is replaced by a note. */
  canRun: boolean;
  /** True while the language runtime is still loading. */
  isPreparing: boolean;
  isCompiling: boolean;
  compileResult: CompileResult | null;
  disabled?: boolean;
  editorHeight?: string;
}

export function CodeExerciseCard({
  question,
  code,
  onChange,
  onCompile,
  canRun,
  isPreparing,
  isCompiling,
  compileResult,
  disabled,
  editorHeight = '420px',
}: CodeExerciseCardProps) {
  const monacoLanguage = MONACO_LANGUAGE_MAP[question.language] ?? 'plaintext';
  const isVisual = question.techDomain === 'html_css';

  const previewSrcDoc = useMemo(() => {
    if (!isVisual) return null;
    if (code.includes('<html')) return code;
    return `<html><style>${code}</style><body><div class="preview-container">Test Element</div></body></html>`;
  }, [code, isVisual]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs ring-1 ring-foreground/10">
      <div>
        <h2 className="text-base font-medium">{question.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{question.description}</p>
        {question.constraints && (
          <p className="mt-1 text-sm text-muted-foreground">{question.constraints}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <Editor
          height={editorHeight}
          language={monacoLanguage}
          value={code}
          onChange={(value) => onChange(value ?? '')}
          options={{ readOnly: disabled, minimap: { enabled: false }, fontSize: 14 }}
          theme="vs-dark"
        />
      </div>

      {isVisual ? (
        <iframe
          srcDoc={previewSrcDoc || ''}
          title="Live Preview"
          sandbox="allow-scripts"
          className="h-48 w-full rounded-md border bg-background"
        />
      ) : canRun ? (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onCompile}
              disabled={disabled || isCompiling || isPreparing}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium shadow-xs transition-all hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              {isPreparing ? 'Preparing…' : isCompiling ? 'Running…' : 'Run Code'}
            </button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm font-mono">
            {compileResult
              ? compileResult.output || '(No output. Add print() calls to see results.)'
              : '// Output will appear here after you run your code.'}
          </pre>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Running code isn’t available for this language here. Your code will still be reviewed when you submit.
        </p>
      )}
    </div>
  );
}
