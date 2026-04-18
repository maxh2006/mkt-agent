"use client";

import { cn } from "@/lib/utils";

interface CheckboxGroupProps {
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  disabled?: boolean;
}

export function CheckboxGroup({ options, selected, onChange, disabled }: CheckboxGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = selected.includes(o.value);
        return (
          <button key={o.value} type="button" disabled={disabled}
            onClick={() => onChange(checked ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              checked ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
