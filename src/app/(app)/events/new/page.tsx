"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eventsApi } from "@/lib/events-api";
import { EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES } from "@/lib/validations/event";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

interface FormData {
  title: string;
  event_type: string;
  objective: string;
  rules: string;
  reward: string;
  start_at: string;
  end_at: string;
  theme: string;
  status: string;
}

const EMPTY: FormData = {
  title: "",
  event_type: "",
  objective: "",
  rules: "",
  reward: "",
  start_at: "",
  end_at: "",
  theme: "",
  status: "draft",
};

interface FieldErrors {
  title?: string;
  event_type?: string;
  end_at?: string;
}

function validate(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.title.trim()) errors.title = "Title is required";
  if (!data.event_type) errors.event_type = "Event type is required";
  if (data.start_at && data.end_at && new Date(data.end_at) <= new Date(data.start_at)) {
    errors.end_at = "End date must be after start date";
  }
  return errors;
}

function LabeledField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const textareaClass = inputClass + " resize-y";

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FieldErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        event_type: form.event_type,
        status: form.status,
      };
      if (form.objective.trim()) payload.objective = form.objective.trim();
      if (form.rules.trim()) payload.rules = form.rules.trim();
      if (form.reward.trim()) payload.reward = form.reward.trim();
      if (form.theme.trim()) payload.theme = form.theme.trim();
      if (form.start_at) payload.start_at = new Date(form.start_at).toISOString();
      if (form.end_at) payload.end_at = new Date(form.end_at).toISOString();

      const event = await eventsApi.create(payload);
      router.push(`/events/${event.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Button>
        <h1 className="text-xl font-semibold">New Event</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {submitError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* Title */}
        <LabeledField label="Title" required error={errors.title}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={255}
            placeholder="e.g. Top Fans July 2026"
            className={inputClass}
            disabled={submitting}
          />
        </LabeledField>

        {/* Event Type + Status row */}
        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Event Type" required error={errors.event_type}>
            <Select
              value={form.event_type}
              onValueChange={(v) => set("event_type", v ?? "")}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>

          <LabeledField label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v ?? "draft")}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Start Date &amp; Time">
            <input
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => set("start_at", e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </LabeledField>
          <LabeledField label="End Date &amp; Time" error={errors.end_at}>
            <input
              type="datetime-local"
              value={form.end_at}
              onChange={(e) => set("end_at", e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </LabeledField>
        </div>

        {/* Theme */}
        <LabeledField label="Theme">
          <input
            type="text"
            value={form.theme}
            onChange={(e) => set("theme", e.target.value)}
            maxLength={255}
            placeholder="e.g. Summer Promotion, VIP Week"
            className={inputClass}
            disabled={submitting}
          />
        </LabeledField>

        {/* Objective */}
        <LabeledField label="Objective">
          <textarea
            value={form.objective}
            onChange={(e) => set("objective", e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="What is the goal of this event?"
            className={textareaClass}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground text-right">{form.objective.length}/1000</p>
        </LabeledField>

        {/* Rules */}
        <LabeledField label="Rules">
          <textarea
            value={form.rules}
            onChange={(e) => set("rules", e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Eligibility criteria, entry rules, terms…"
            className={textareaClass}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground text-right">{form.rules.length}/2000</p>
        </LabeledField>

        {/* Reward */}
        <LabeledField label="Reward">
          <input
            type="text"
            value={form.reward}
            onChange={(e) => set("reward", e.target.value)}
            maxLength={500}
            placeholder="e.g. $500 bonus, Free spins, Cash prize"
            className={inputClass}
            disabled={submitting}
          />
        </LabeledField>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Event"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
