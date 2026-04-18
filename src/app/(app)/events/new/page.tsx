"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { eventsApi } from "@/lib/events-api";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/validations/event";
import { formatPostingInstanceWithEnd, type PostingInstanceConfig } from "@/lib/posting-instance";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EventDateTimePicker,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  joinDatetime,
} from "@/components/events/event-datetime-picker";

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter/X" },
  { value: "tiktok", label: "TikTok" },
  { value: "telegram", label: "Telegram" },
];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i;
  const label = h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
  return { value: `${String(h).padStart(2, "0")}:00`, label };
});

interface FormData {
  title: string;
  event_type: string;
  objective: string;
  rules: string;
  reward: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  theme: string;
  target_audience: string;
  cta: string;
  tone: string;
  platform_scope: string[];
  notes_for_ai: string;
  posting_frequency: string;
  posting_time: string;
  posting_weekdays: number[];
  posting_month_days: number[];
  auto_generate_posts: boolean;
}

const EMPTY: FormData = {
  title: "", event_type: "", objective: "", rules: "", reward: "",
  start_date: "", start_time: DEFAULT_START_TIME,
  end_date: "", end_time: DEFAULT_END_TIME,
  theme: "",
  target_audience: "", cta: "", tone: "",
  platform_scope: [], notes_for_ai: "",
  posting_frequency: "", posting_time: "15:00",
  posting_weekdays: [], posting_month_days: [],
  auto_generate_posts: false,
};

interface FieldErrors { title?: string; event_type?: string; end_date?: string; }

function validate(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.title.trim()) errors.title = "Title is required";
  if (!data.event_type) errors.event_type = "Event type is required";
  const startDt = joinDatetime(data.start_date, data.start_time);
  const endDt = joinDatetime(data.end_date, data.end_time);
  if (startDt && endDt && new Date(endDt) <= new Date(startDt)) {
    errors.end_date = "End date must be after start date";
  }
  return errors;
}

function LabeledField({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pt-4 pb-1 border-b border-border">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = inputClass + " resize-y";

function CheckboxGroup({ options, selected, onChange, disabled }: {
  options: { value: string | number; label: string }[];
  selected: (string | number)[];
  onChange: (values: (string | number)[]) => void;
  disabled?: boolean;
}) {
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

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FieldErrors]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  const postingConfig = useMemo((): PostingInstanceConfig | null => {
    if (!form.posting_frequency) return null;
    const config: PostingInstanceConfig = {
      frequency: form.posting_frequency as PostingInstanceConfig["frequency"],
      time: form.posting_time,
    };
    if (form.posting_frequency === "weekly") config.weekdays = form.posting_weekdays;
    if (form.posting_frequency === "monthly") config.month_days = form.posting_month_days;
    return config;
  }, [form.posting_frequency, form.posting_time, form.posting_weekdays, form.posting_month_days]);

  const postingSummary = useMemo(() => {
    if (!postingConfig) return null;
    const endDt = joinDatetime(form.end_date, form.end_time);
    const endDate = endDt ? new Date(endDt) : null;
    return formatPostingInstanceWithEnd(postingConfig, endDate);
  }, [postingConfig, form.end_date, form.end_time]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        event_type: form.event_type,
      };
      if (form.objective.trim()) payload.objective = form.objective.trim();
      if (form.rules.trim()) payload.rules = form.rules.trim();
      if (form.reward.trim()) payload.reward = form.reward.trim();
      if (form.theme.trim()) payload.theme = form.theme.trim();
      const startDt = joinDatetime(form.start_date, form.start_time);
      const endDt = joinDatetime(form.end_date, form.end_time);
      if (startDt) payload.start_at = new Date(startDt).toISOString();
      if (endDt) payload.end_at = new Date(endDt).toISOString();
      if (form.target_audience.trim()) payload.target_audience = form.target_audience.trim();
      if (form.cta.trim()) payload.cta = form.cta.trim();
      if (form.tone.trim()) payload.tone = form.tone.trim();
      if (form.platform_scope.length > 0) payload.platform_scope = form.platform_scope;
      if (form.notes_for_ai.trim()) payload.notes_for_ai = form.notes_for_ai.trim();
      if (postingConfig) payload.posting_instance_json = postingConfig;
      payload.auto_generate_posts = form.auto_generate_posts;

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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4" /> Events
        </Button>
        <h1 className="text-xl font-semibold">New Campaign Event</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {submitError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        )}

        {/* ─── Core Info ──────────────────────────────────────────── */}
        <SectionHeader title="Event Details" />

        <LabeledField label="Title" required error={errors.title}>
          <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
            maxLength={255} placeholder="e.g. Top Fans July 2026" className={inputClass} disabled={submitting} />
        </LabeledField>

        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Event Type" required error={errors.event_type}>
            <Select value={form.event_type} onValueChange={(v) => set("event_type", v ?? "")} disabled={submitting}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select type…" /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</SelectItem>)}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField label="Theme">
            <input type="text" value={form.theme} onChange={(e) => set("theme", e.target.value)}
              maxLength={255} placeholder="e.g. Summer Promotion" className={inputClass} disabled={submitting} />
          </LabeledField>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="Start Date & Time">
            <EventDateTimePicker
              dateValue={form.start_date} timeValue={form.start_time}
              onDateChange={(v) => set("start_date", v)} onTimeChange={(v) => set("start_time", v)}
              mode="start" disabled={submitting} />
          </LabeledField>
          <LabeledField label="End Date & Time" error={errors.end_date}>
            <EventDateTimePicker
              dateValue={form.end_date} timeValue={form.end_time}
              onDateChange={(v) => set("end_date", v)} onTimeChange={(v) => set("end_time", v)}
              mode="end" disabled={submitting} />
          </LabeledField>
        </div>

        <LabeledField label="Objective">
          <textarea value={form.objective} onChange={(e) => set("objective", e.target.value)}
            maxLength={1000} rows={3} placeholder="What is the goal of this event?" className={textareaClass} disabled={submitting} />
          <p className="text-xs text-muted-foreground text-right">{form.objective.length}/1000</p>
        </LabeledField>

        <LabeledField label="Rules">
          <textarea value={form.rules} onChange={(e) => set("rules", e.target.value)}
            maxLength={2000} rows={3} placeholder="Eligibility criteria, entry rules, terms…" className={textareaClass} disabled={submitting} />
          <p className="text-xs text-muted-foreground text-right">{form.rules.length}/2000</p>
        </LabeledField>

        <LabeledField label="Reward">
          <input type="text" value={form.reward} onChange={(e) => set("reward", e.target.value)}
            maxLength={500} placeholder="e.g. $500 bonus, Free spins" className={inputClass} disabled={submitting} />
        </LabeledField>

        {/* ─── Campaign Brief ─────────────────────────────────────── */}
        <SectionHeader title="Campaign Brief" />

        <LabeledField label="Target Audience" hint="Who is this event for?">
          <textarea value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)}
            maxLength={500} rows={2} placeholder="e.g. VIP players, new depositors, all active players" className={textareaClass} disabled={submitting} />
        </LabeledField>

        <div className="grid grid-cols-2 gap-4">
          <LabeledField label="CTA">
            <input type="text" value={form.cta} onChange={(e) => set("cta", e.target.value)}
              maxLength={200} placeholder="e.g. Deposit Now, Join Today" className={inputClass} disabled={submitting} />
          </LabeledField>
          <LabeledField label="Tone">
            <input type="text" value={form.tone} onChange={(e) => set("tone", e.target.value)}
              maxLength={200} placeholder="e.g. Exciting, Urgent, Friendly" className={inputClass} disabled={submitting} />
          </LabeledField>
        </div>

        <LabeledField label="Platform Scope" hint="Where should content be published?">
          <CheckboxGroup options={PLATFORMS} selected={form.platform_scope}
            onChange={(v) => set("platform_scope", v as string[])} disabled={submitting} />
        </LabeledField>

        <LabeledField label="Notes for AI" hint="Additional instructions for AI content generation">
          <textarea value={form.notes_for_ai} onChange={(e) => set("notes_for_ai", e.target.value)}
            maxLength={2000} rows={3} placeholder="e.g. Use Filipino-English mix, highlight the 100x multiplier, avoid mentioning competitor brands…"
            className={textareaClass} disabled={submitting} />
        </LabeledField>

        {/* ─── Posting Schedule ────────────────────────────────────── */}
        <SectionHeader title="Posting Schedule" />

        <LabeledField label="Frequency">
          <Select value={form.posting_frequency || "none"} onValueChange={(v) => set("posting_frequency", v === "none" ? "" : (v ?? ""))} disabled={submitting}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </LabeledField>

        {form.posting_frequency && (
          <>
            <LabeledField label="Posting Time">
              <Select value={form.posting_time} onValueChange={(v) => set("posting_time", v ?? "15:00")} disabled={submitting}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </LabeledField>

            {form.posting_frequency === "weekly" && (
              <LabeledField label="Post on These Days">
                <CheckboxGroup options={WEEKDAYS} selected={form.posting_weekdays}
                  onChange={(v) => set("posting_weekdays", v as number[])} disabled={submitting} />
              </LabeledField>
            )}

            {form.posting_frequency === "monthly" && (
              <LabeledField label="Post on These Days of Month">
                <CheckboxGroup
                  options={Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
                  selected={form.posting_month_days}
                  onChange={(v) => set("posting_month_days", v as number[])} disabled={submitting} />
              </LabeledField>
            )}

            {postingSummary && (
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-sm text-muted-foreground">{postingSummary}</p>
              </div>
            )}
          </>
        )}

        <LabeledField label="Auto-generate drafts">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.auto_generate_posts}
              onChange={(e) => set("auto_generate_posts", e.target.checked)} disabled={submitting}
              className="h-4 w-4 rounded border-input" />
            <span className="text-sm">Automatically generate content drafts into Content Queue</span>
          </label>
        </LabeledField>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Campaign Event"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
