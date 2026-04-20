"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dices } from "lucide-react";
import { SAMPLE_EVENT_BRIEFS, pickRandomSample, type EventSampleBrief } from "@/lib/event-sample-briefs";

const ROWS: Array<{ key: keyof EventSampleBrief; label: string }> = [
  { key: "theme",           label: "Theme" },
  { key: "objective",       label: "Objective" },
  { key: "rules",           label: "Rules" },
  { key: "reward",          label: "Reward" },
  { key: "target_audience", label: "Target Audience" },
  { key: "cta",             label: "CTA" },
  { key: "tone",            label: "Tone" },
  { key: "notes_for_ai",    label: "Notes for AI" },
];

export function SampleBriefPanel() {
  const [index, setIndex] = useState<number>(() => Math.floor(Math.random() * SAMPLE_EVENT_BRIEFS.length));
  const brief = SAMPLE_EVENT_BRIEFS[index];

  function regenerate() {
    const result = pickRandomSample(index);
    setIndex(result.index);
  }

  return (
    <aside className="rounded-lg border border-border bg-muted/20 p-4 lg:sticky lg:top-6 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Sample Event Brief</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Reference only — this does not fill the form.
        </p>
      </div>

      <div className="rounded-md border bg-background">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example</p>
          <p className="text-sm font-medium truncate">{brief.title}</p>
        </div>
        <dl className="divide-y divide-border text-xs">
          {ROWS.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-2">
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd className="text-foreground whitespace-pre-wrap break-words">{brief[key]}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
        onClick={regenerate}
      >
        <Dices className="h-3.5 w-3.5" />
        Generate Sample Prompt
      </Button>
    </aside>
  );
}
