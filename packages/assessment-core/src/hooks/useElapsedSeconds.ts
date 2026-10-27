import { useEffect, useState } from 'react';

/**
 * Ticks up once per second, resetting whenever `resetKey` changes.
 * Used to track per-question time spent for grading/analytics.
 */
export function useElapsedSeconds(resetKey: string | null): number {
  const [seconds, setSeconds] = useState(0);
  const [countingFor, setCountingFor] = useState(resetKey);

  // Reset during render rather than in an effect, so a new key never
  // shows the previous key's count for a frame.
  if (resetKey !== countingFor) {
    setCountingFor(resetKey);
    setSeconds(0);
  }

  useEffect(() => {
    if (resetKey === null) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [resetKey]);

  return seconds;
}
