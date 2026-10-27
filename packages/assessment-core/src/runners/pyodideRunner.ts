import type { CompileResult } from '../types';
import type { CodeRunner } from './codeRunner';

export interface PyodideRunnerOptions {
  /**
   * URL of the plain-JS module worker (public/pyodide-runner.worker.mjs in
   * this app). It must not go through the bundler: Turbopack emits classic
   * workers, which Pyodide refuses to run in.
   */
  workerURL: string;
  /** Folder serving pyodide.mjs and friends, with a trailing slash -- e.g. "/pyodide/314.0.7/". */
  indexURL: string;
  /** A run longer than this is stopped (catches `while True:`). Default 5000. */
  timeoutMs?: number;
  /** Output beyond this is cut off. Default 10000. */
  maxOutputChars?: number;
}

type OutMessage =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; success: boolean; output: string };

/**
 * In-browser Python runner. Pyodide loads in a Web Worker on first use
 * (or preload); a run that exceeds `timeoutMs` terminates the worker and
 * the next run starts a fresh one. Output is produced in the employee's
 * browser, so the grader must treat it as unverified.
 */
export function createPyodideRunner({
  workerURL,
  indexURL,
  timeoutMs = 5000,
  maxOutputChars = 10_000,
}: PyodideRunnerOptions): CodeRunner {
  let worker: Worker | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;
  const pending = new Map<number, (result: CompileResult) => void>();

  function stop(reason: string) {
    worker?.terminate();
    worker = null;
    ready = null;
    for (const resolve of pending.values()) resolve({ success: false, output: reason });
    pending.clear();
  }

  function start(): Promise<void> {
    if (ready) return ready;
    const w = new Worker(/* turbopackIgnore: true */ workerURL, { type: 'module' });
    worker = w;
    ready = new Promise<void>((resolve, reject) => {
      w.onmessage = (event: MessageEvent<OutMessage>) => {
        const message = event.data;
        if (message.type === 'ready') resolve();
        else if (message.type === 'init-error') {
          stop(`Couldn't load Python: ${message.message}`);
          reject(new Error(message.message));
        } else {
          pending.get(message.id)?.({ success: message.success, output: message.output });
          pending.delete(message.id);
        }
      };
      w.onerror = (event) => {
        const message = event.message || 'the Python worker failed to start';
        stop(`Couldn't load Python: ${message}`);
        reject(new Error(message));
      };
    });
    w.postMessage({ type: 'init', indexURL, maxOutputChars });
    return ready;
  }

  return {
    async preload() {
      try {
        await start();
      } catch {
        // run() reports the failure if the employee actually presses Run.
      }
    },

    async run(code: string): Promise<CompileResult> {
      try {
        await start();
      } catch (err) {
        return { success: false, output: `Couldn't load Python: ${err instanceof Error ? err.message : String(err)}` };
      }
      const id = nextId++;
      return new Promise<CompileResult>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          stop('');
          resolve({
            success: false,
            output: `Stopped after ${timeoutMs / 1000} seconds. Check for an infinite loop or very slow code.`,
          });
        }, timeoutMs);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        worker!.postMessage({ type: 'run', id, code });
      });
    },
  };
}
