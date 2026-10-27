import type { ReactNode } from 'react';
import type { AssessmentApiClient } from '@assessment-toolkit/core';
import { useIntegrityMonitor, useHeartbeatTimer } from '@assessment-toolkit/core';

export interface IntegrityShellProps {
  api: AssessmentApiClient;
  assessmentId: string | null;
  userId: string | null;
  /** assessments.id -- forwarded to useHeartbeatTimer; see its doc comment. */
  assessmentDefinitionId: string;
  questionIndex: number;
  questionCount?: number;
  maxWarnings?: number;
  onLockout: (reason: string) => void;
  onExpired: () => void;
  children: ReactNode;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fullscreen lock screen + header/timer/progress bar wrapper. Composes
 * useIntegrityMonitor (fullscreen/tab/blur infractions) with
 * useHeartbeatTimer (server-authoritative countdown).
 */
export function IntegrityShell({
  api,
  assessmentId,
  userId,
  assessmentDefinitionId,
  questionIndex,
  questionCount,
  maxWarnings = 3,
  onLockout,
  onExpired,
  children,
}: IntegrityShellProps) {
  const integrity = useIntegrityMonitor({
    maxWarnings,
    // Scoped per attempt so a lockout never carries into the next attempt.
    storageKey: `assessment_integrity_strikes:${assessmentId ?? 'pending'}`,
    onLockout: () => onLockout('Too many integrity warnings (fullscreen exits or tab switches).'),
  });
  const { timeLeft } = useHeartbeatTimer({ api, assessmentId, userId, assessmentDefinitionId, onExpired });

  if (integrity.isLockedOut) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-bold">Assessment Locked</h1>
        <p className="text-muted-foreground">Too many integrity warnings were recorded. This session has ended.</p>
      </div>
    );
  }

  if (assessmentId && !integrity.isFullscreen) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Fullscreen Required</h1>
          <p className="mt-2 text-muted-foreground">This assessment must be taken in fullscreen mode.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Leaving fullscreen, switching tabs, or reloading the page counts as a warning. After {maxWarnings}, the assessment is locked.
          </p>
          {integrity.warningCount > 0 && (
            <p className="mt-3 text-sm font-medium text-destructive">
              Warnings: {integrity.warningCount}/{maxWarnings}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => integrity.requestFullscreen()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/80"
        >
          Enter Fullscreen
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4 rounded-md border bg-card px-4 py-3 text-sm">
        {typeof questionCount === 'number' && (
          <span className="font-medium">
            Question {questionIndex + 1} of {questionCount}
          </span>
        )}
        <span className="font-mono tabular-nums">{timeLeft !== null ? formatTime(timeLeft) : '--:--'}</span>
        <span className="text-muted-foreground">
          Warnings: {integrity.warningCount}/{maxWarnings}
        </span>
      </header>
      <main className="flex flex-col gap-4">{children}</main>
    </div>
  );
}
