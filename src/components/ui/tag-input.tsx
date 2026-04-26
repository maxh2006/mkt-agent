"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50";

/**
 * Tag-style multi-value input. Type a value, hit Enter or "Add" to commit.
 * Duplicates are dropped silently. Empty drafts are dropped silently.
 *
 * Used for ban lists, hashtags, and "do-not-include" visual elements.
 * Brand Management ships its own copy locally (older surface); the Event
 * Visual Override UI uses this shared version. Future cleanup task can
 * DRY the brand page onto this component.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
  maxItems,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Optional cap; further entries are silently dropped at the trim step. */
  maxItems?: number;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) {
      setDraft("");
      return;
    }
    if (maxItems !== undefined && value.length >= maxItems) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={cn(inputCls, "flex-1")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={disabled}>
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((t) => t !== tag))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
