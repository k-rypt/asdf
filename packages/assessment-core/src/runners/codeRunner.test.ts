import { describe, expect, it } from 'vitest';
import { getCodeRunner, type CodeRunner } from './codeRunner';

const python: CodeRunner = {
  preload: async () => {},
  run: async () => ({ success: true, output: '' }),
};

describe('getCodeRunner', () => {
  it('returns the runner registered for the language', () => {
    expect(getCodeRunner({ python }, 'python')).toBe(python);
  });

  it('returns null for a language with no runner', () => {
    expect(getCodeRunner({ python }, 'java')).toBeNull();
  });

  it('returns null when there is no registry', () => {
    expect(getCodeRunner(undefined, 'python')).toBeNull();
  });
});
