import { useEffect, useRef, useState } from 'react';
import type { AssessmentApiClient } from '../client/AssessmentApiClient';

export interface UseHeartbeatTimerOptions {
  assessmentId: string | null;
  userId: string | null;
  /** assessments.id -- required so the backend can resolve the right assessment even when the caller has more than one reachable at once. See AssessmentApiClient.heartbeat's doc comment. */
  assessmentDefinitionId: string;
  api: AssessmentApiClient;
  /** Poll interval in ms. Default 30000 (30s), matching devassess-platform. */
  intervalMs?: number;
  onExpired?: () => void;
}

export interface HeartbeatTimerState {
  /** Server-authoritative seconds remaining, or null until the first heartbeat resolves. */
  timeLeft: number | null;
}

/**
 * Server-authoritative countdown: polls the backend every `intervalMs` for
 * remaining time and locally ticks down by one second between polls so the
 * UI stays smooth, while the server value is always the source of truth.
 */
export function useHeartbeatTimer({
  assessmentId,
  userId,
  assessmentDefinitionId,
  api,
  intervalMs = 30000,
  onExpired,
}: UseHeartbeatTimerOptions): HeartbeatTimerState {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!assessmentId || !userId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await api.heartbeat(assessmentId, userId, assessmentDefinitionId);
        if (cancelled) return;
        if (result.expired) {
          onExpiredRef.current?.();
          return;
        }
        if (typeof result.timeLeft === 'number') setTimeLeft(result.timeLeft);
      } catch {
        // Non-fatal: keep the local countdown running and retry on the next tick.
      }
    };

    poll();
    const pollTimer = setInterval(poll, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [api, assessmentId, assessmentDefinitionId, intervalMs, userId]);

  // Start the local tick once the first heartbeat lands; keyed on
  // `started`, not `timeLeft`, so each tick doesn't restart the interval.
  const started = timeLeft !== null;
  useEffect(() => {
    if (!started) return;
    const tick = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
    }, 1000);
    return () => clearInterval(tick);
  }, [started]);

  return { timeLeft };
}
