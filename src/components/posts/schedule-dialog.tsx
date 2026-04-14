"use client";

import { cloneElement, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ScheduleDialogProps {
  onSchedule: (scheduledAt: string) => Promise<void>;
  trigger: React.ReactElement<{ onClick?: () => void }>;
}

// Returns a datetime-local string rounded up to the next 15-min interval
function defaultDatetimeLocal(): string {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Minimum: now + 5 minutes
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleDialog({ onSchedule, trigger }: ScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => defaultDatetimeLocal());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSchedule() {
    if (!scheduledAt) {
      setError("Please select a date and time");
      return;
    }
    const iso = new Date(scheduledAt).toISOString();
    if (new Date(iso) <= new Date()) {
      setError("Scheduled time must be in the future");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSchedule(iso);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule post");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!loading) {
      setOpen(next);
      if (!next) {
        setScheduledAt(defaultDatetimeLocal());
        setError(null);
      }
    }
  }

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule Post</DialogTitle>
            <DialogDescription>
              Choose when this post should be published.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Publish date &amp; time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minDatetimeLocal()}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={loading}>
              {loading ? "Scheduling…" : "Schedule Post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
