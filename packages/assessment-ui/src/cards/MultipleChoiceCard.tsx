import type { MultipleChoiceQuestion, TrueFalseQuestion } from '@assessment-toolkit/core';

export interface MultipleChoiceCardProps {
  question: MultipleChoiceQuestion | TrueFalseQuestion;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
}

export function MultipleChoiceCard({ question, selectedOptionId, onSelect, disabled }: MultipleChoiceCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs ring-1 ring-foreground/10">
      <div>
        <h2 className="text-base font-medium">{question.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{question.description}</p>
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={question.title}>
        {question.options.map((option) => {
          const inputId = `${question.id}-${option.id}`;
          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm transition-colors hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-muted/50"
            >
              <input
                id={inputId}
                type="radio"
                name={question.id}
                value={option.id}
                checked={selectedOptionId === option.id}
                onChange={() => onSelect(option.id)}
                disabled={disabled}
                className="h-4 w-4 accent-primary"
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
