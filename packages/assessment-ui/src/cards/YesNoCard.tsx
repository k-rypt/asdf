import type { YesNoQuestion } from '@assessment-toolkit/core';

export interface YesNoCardProps {
  question: YesNoQuestion;
  value: boolean | null;
  onSelect: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Renders a single self-report yes/no item from the tiered assessment
 * ladder. No "correct" option is highlighted -- this is a survey
 * question, not a graded one (see evaluateYesNoTier in the server package
 * for how a batch of these rolls up into a tier pass/fail).
 */
export function YesNoCard({ question, value, onSelect, disabled }: YesNoCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs ring-1 ring-foreground/10">
      <div>
        {question.tierLabel && (
          <p className="text-sm font-medium text-muted-foreground">{question.tierLabel}</p>
        )}
        <h2 className="text-base font-medium">{question.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{question.description}</p>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.title}>
        <label
          htmlFor={`${question.id}-yes`}
          className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/50"
        >
          <input
            id={`${question.id}-yes`}
            type="radio"
            name={question.id}
            checked={value === true}
            onChange={() => onSelect(true)}
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          <span>Yes</span>
        </label>
        <label
          htmlFor={`${question.id}-no`}
          className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/50"
        >
          <input
            id={`${question.id}-no`}
            type="radio"
            name={question.id}
            checked={value === false}
            onChange={() => onSelect(false)}
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          <span>No</span>
        </label>
      </div>
    </div>
  );
}
