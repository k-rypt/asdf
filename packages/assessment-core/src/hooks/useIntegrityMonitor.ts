import { useCallback, useEffect, useRef, useState } from 'react';

export interface IntegrityMonitorOptions {
  /** Number of infractions (fullscreen exits, tab switches, etc.) before lockout. Default 3. */
  maxWarnings?: number;
  /**
   * localStorage key used to persist strikes across reloads. Default
   * 'assessment_integrity_strikes'. Scope it per attempt (e.g. suffix the
   * attempt id) -- a shared key carries one attempt's lockout into every
   * later attempt in the same browser.
   */
  storageKey?: string;
  /** Called every time a new infraction is recorded, after local state updates. */
  onWarning?: (warningCount: number) => void;
  /** Called once the warning count reaches maxWarnings. */
  onLockout?: () => void;
}

export interface IntegrityMonitorState {
  warningCount: number;
  isFullscreen: boolean;
  isLockedOut: boolean;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  resetWarnings: () => void;
}

const WARNING_DEDUPE_MS = 1000;

function readStoredStrikes(storageKey: string): number {
  if (typeof window === 'undefined') return 0;
  const stored = window.localStorage.getItem(storageKey);
  return stored ? parseInt(stored, 10) || 0 : 0;
}

/**
 * Extracted from devassess-platform's AssessmentEditor: watches fullscreen
 * exits, tab/window blur, and visibility changes, and escalates a warning
 * counter (persisted in localStorage) up to a lockout threshold.
 */
export function useIntegrityMonitor(options: IntegrityMonitorOptions = {}): IntegrityMonitorState {
  const {
    maxWarnings = 3,
    storageKey = 'assessment_integrity_strikes',
    onWarning,
    onLockout,
  } = options;

  const [warningCount, setWarningCount] = useState<number>(() => readStoredStrikes(storageKey));
  const [loadedKey, setLoadedKey] = useState(storageKey);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const lastWarningAtRef = useRef(0);
  // Strikes only start counting once the user has entered fullscreen --
  // focus changes while they're still on the "Enter Fullscreen" prompt
  // (or setting up their browser) aren't infractions yet.
  const armedRef = useRef(isFullscreen);

  // Re-read during render when the key changes (e.g. a new attempt id
  // arrives) so strikes never leak from one attempt's key into another's.
  if (loadedKey !== storageKey) {
    setLoadedKey(storageKey);
    setWarningCount(readStoredStrikes(storageKey));
  }

  const isLockedOut = warningCount >= maxWarnings;

  const registerWarning = useCallback(() => {
    if (!armedRef.current) return;
    // One user action can fire several events (pressing Esc exits
    // fullscreen and can also blur the window), so collapse anything
    // within the dedupe window into a single strike.
    const now = Date.now();
    if (now - lastWarningAtRef.current < WARNING_DEDUPE_MS) return;
    lastWarningAtRef.current = now;

    // Persist synchronously, not inside a setState updater: a reload fires
    // visibilitychange during unload, and a queued updater never runs
    // because the page is gone before the next render. localStorage is
    // the source of truth; state just mirrors it. (Side effects inside an
    // updater also run twice under StrictMode.)
    const next = Math.min(readStoredStrikes(storageKey) + 1, maxWarnings);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, String(next));
    }
    setWarningCount(next);
    onWarning?.(next);
    if (next >= maxWarnings) onLockout?.();
  }, [maxWarnings, onLockout, onWarning, storageKey]);

  const resetWarnings = useCallback(() => {
    setWarningCount(0);
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  const requestFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // Browsers reject this outside a user gesture; the caller keeps
      // showing its "Enter Fullscreen" prompt, so there's nothing to do.
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) await document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Every exit from fullscreen is a strike -- entering fires this event
    // too, but only the !fs transition counts.
    const handleFullscreenChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (fs) armedRef.current = true;
      else registerWarning();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) registerWarning();
    };

    const handleBlur = () => registerWarning();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [registerWarning]);

  return {
    warningCount,
    isFullscreen,
    isLockedOut,
    requestFullscreen,
    exitFullscreen,
    resetWarnings,
  };
}
