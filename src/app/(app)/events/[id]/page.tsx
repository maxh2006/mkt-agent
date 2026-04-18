"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { eventsApi, type Event } from "@/lib/events-api";
import { EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES } from "@/lib/validations/event";
import { parsePostingInstance, formatPostingInstanceWithEnd, type PostingInstanceConfig } from "@/lib/posting-instance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Pencil, Save, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import {
  EventDateTimePicker,
  DEFAULT_START_TIME,
  DEFAULT_END_TIME,
  splitDatetime,
  joinDatetime,
} from "@/components/events/event-datetime-picker";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  ended: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted/50 text-muted-foreground/60 border-border",
};

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter/X" },
  { value: "tiktok", label: "TikTok" },
  { value: "telegram", label: "Telegram" },
];

const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: `${String(i).padStart(2, "0")}:00`, label };
});

function canEditRole(role?: string) {
  return role === "admin" || role === "brand_manager" || role === "operator";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="italic text-muted-foreground">—</span>}</p>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClass = inputClass + " resize-y";

function EditableField({ label, name, value, onChange, maxLength, rows }: {
  label: string; name: string; value: string; onChange: (v: string) => void; maxLength: number; rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      {rows ? (
        <textarea id={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} rows={rows} className={textareaClass} />
      ) : (
        <input id={name} type="text" value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength} className={inputClass} />
      )}
      <p className="text-right text-xs text-muted-foreground">{value.length}/{maxLength}</p>
    </div>
  );
}


interface EditData {
  title: string; event_type: string; status: string;
  objective: string; rules: string; reward: string;
  start_date: string; start_time: string;
  end_date: string; end_time: string;
  theme: string;
  target_audience: string; cta: string; tone: string;
  platform_scope: string[]; notes_for_ai: string;
  posting_frequency: string; posting_time: string;
  posting_weekdays: number[]; posting_month_days: number[];
  auto_generate_posts: boolean;
}

function initEditData(event: Event): EditData {
  const pi = event.posting_instance_json ? parsePostingInstance(event.posting_instance_json) : null;
  const startParts = splitDatetime(toDatetimeLocal(event.start_at));
  const endParts = splitDatetime(toDatetimeLocal(event.end_at));
  return {
    title: event.title, event_type: event.event_type, status: event.status,
    objective: event.objective ?? "", rules: event.rules ?? "", reward: event.reward ?? "",
    start_date: startParts.date, start_time: startParts.time || DEFAULT_START_TIME,
    end_date: endParts.date, end_time: endParts.time || DEFAULT_END_TIME,
    theme: event.theme ?? "",
    target_audience: event.target_audience ?? "", cta: event.cta ?? "", tone: event.tone ?? "",
    platform_scope: event.platform_scope ?? [], notes_for_ai: event.notes_for_ai ?? "",
    posting_frequency: pi?.frequency ?? "", posting_time: pi?.time ?? "15:00",
    posting_weekdays: pi?.weekdays ?? [], posting_month_days: pi?.month_days ?? [],
    auto_generate_posts: event.auto_generate_posts,
  };
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = canEditRole(session?.user?.role);

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const { data: event, isLoading, isError, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => eventsApi.get(id),
    enabled: !!id,
    retry: false,
  });

  function startEdit(ev: Event) { setEditData(initEditData(ev)); setSaveError(null); setEditing(true); }
  function cancelEdit() { setEditing(false); setEditData(null); setSaveError(null); }
  function setField<K extends keyof EditData>(key: K, value: EditData[K]) { setEditData((p) => p ? { ...p, [key]: value } : p); }

  const editPostingConfig = useMemo((): PostingInstanceConfig | null => {
    if (!editData?.posting_frequency) return null;
    const c: PostingInstanceConfig = { frequency: editData.posting_frequency as PostingInstanceConfig["frequency"], time: editData.posting_time };
    if (editData.posting_frequency === "weekly") c.weekdays = editData.posting_weekdays;
    if (editData.posting_frequency === "monthly") c.month_days = editData.posting_month_days;
    return c;
  }, [editData?.posting_frequency, editData?.posting_time, editData?.posting_weekdays, editData?.posting_month_days]);

  async function saveEdit() {
    if (!editData) return;
    const startDt = joinDatetime(editData.start_date, editData.start_time);
    const endDt = joinDatetime(editData.end_date, editData.end_time);
    if (startDt && endDt && new Date(endDt) <= new Date(startDt)) {
      setSaveError("End date must be after start date"); return;
    }
    setSaving(true); setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        title: editData.title.trim(), event_type: editData.event_type, status: editData.status,
        objective: editData.objective.trim() || null, rules: editData.rules.trim() || null,
        reward: editData.reward.trim() || null, theme: editData.theme.trim() || null,
        target_audience: editData.target_audience.trim() || null, cta: editData.cta.trim() || null,
        tone: editData.tone.trim() || null, notes_for_ai: editData.notes_for_ai.trim() || null,
        platform_scope: editData.platform_scope.length > 0 ? editData.platform_scope : null,
        auto_generate_posts: editData.auto_generate_posts,
      };
      if (startDt) payload.start_at = new Date(startDt).toISOString();
      if (endDt) payload.end_at = new Date(endDt).toISOString();
      if (editPostingConfig) payload.posting_instance_json = editPostingConfig;
      await eventsApi.update(id, payload);
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setEditing(false); setEditData(null);
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleGenerateDrafts() {
    setGenerating(true); setGenerateMsg(null);
    try {
      const result = await eventsApi.generateDrafts(id);
      setGenerateMsg(`${result.created} draft post${result.created !== 1 ? "s" : ""} created from ${result.occurrences} occurrence${result.occurrences !== 1 ? "s" : ""}.`);
    } catch (err) { setGenerateMsg(err instanceof Error ? err.message : "Failed to generate drafts"); }
    finally { setGenerating(false); }
  }

  if (isLoading) return <div className="flex items-center justify-center py-20"><p className="text-sm text-muted-foreground">Loading event…</p></div>;
  if (isError) return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /> Back</Button>
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load event"}</p>
      </div>
    </div>
  );
  if (!event) return null;

  const piConfig = event.posting_instance_json ? parsePostingInstance(event.posting_instance_json) : null;
  const piSummary = piConfig ? formatPostingInstanceWithEnd(piConfig, event.end_at) : null;
  const canGenerate = canEdit && event.status === "active" && piConfig && event.start_at && event.end_at;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" /> Events
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{event.title}</h1>
            <Badge variant="outline" className={cn(STATUS_COLORS[event.status] ?? "bg-muted text-muted-foreground border-border")}>
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} · Created by {event.creator?.name ?? "—"} · {formatDate(event.created_at)}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => startEdit(event)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        )}
        {editing && (
          <>
            <Button size="sm" onClick={saveEdit} disabled={saving}><Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}</Button>
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}><X className="h-3.5 w-3.5" /> Cancel</Button>
          </>
        )}
        {!editing && canGenerate && (
          <Button variant="outline" size="sm" onClick={handleGenerateDrafts} disabled={generating}>
            <Sparkles className="h-3.5 w-3.5" /> {generating ? "Generating…" : "Generate Drafts"}
          </Button>
        )}
      </div>
      {generateMsg && (
        <div className="rounded-md bg-muted/50 px-3 py-2"><p className="text-sm text-muted-foreground">{generateMsg}</p></div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {/* Event Details */}
          <div className="rounded-lg border border-border p-5 space-y-5">
            <h2 className="text-sm font-semibold">Event Details</h2>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}

            {editing && editData ? (
              <>
                <EditableField label="Title" name="title" value={editData.title} onChange={(v) => setField("title", v)} maxLength={255} />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event Type</label>
                    <Select value={editData.event_type} onValueChange={(v) => setField("event_type", v ?? editData.event_type)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</label>
                    <Select value={editData.status} onValueChange={(v) => setField("status", v ?? editData.status)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{EVENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start</label>
                    <EventDateTimePicker
                      dateValue={editData.start_date} timeValue={editData.start_time}
                      onDateChange={(v) => setField("start_date", v)} onTimeChange={(v) => setField("start_time", v)}
                      mode="start" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End</label>
                    <EventDateTimePicker
                      dateValue={editData.end_date} timeValue={editData.end_time}
                      onDateChange={(v) => setField("end_date", v)} onTimeChange={(v) => setField("end_time", v)}
                      mode="end" />
                  </div>
                </div>
                <EditableField label="Theme" name="theme" value={editData.theme} onChange={(v) => setField("theme", v)} maxLength={255} />
                <EditableField label="Objective" name="objective" value={editData.objective} onChange={(v) => setField("objective", v)} maxLength={1000} rows={3} />
                <EditableField label="Rules" name="rules" value={editData.rules} onChange={(v) => setField("rules", v)} maxLength={2000} rows={3} />
                <EditableField label="Reward" name="reward" value={editData.reward} onChange={(v) => setField("reward", v)} maxLength={500} />
              </>
            ) : (
              <>
                <Field label="Objective" value={event.objective} />
                <Field label="Rules" value={event.rules} />
                <Field label="Reward" value={event.reward} />
                <Field label="Theme" value={event.theme} />
              </>
            )}
          </div>

          {/* Campaign Brief */}
          <div className="rounded-lg border border-border p-5 space-y-5">
            <h2 className="text-sm font-semibold">Campaign Brief</h2>
            {editing && editData ? (
              <>
                <EditableField label="Target Audience" name="target_audience" value={editData.target_audience} onChange={(v) => setField("target_audience", v)} maxLength={500} rows={2} />
                <div className="grid grid-cols-2 gap-4">
                  <EditableField label="CTA" name="cta" value={editData.cta} onChange={(v) => setField("cta", v)} maxLength={200} />
                  <EditableField label="Tone" name="tone" value={editData.tone} onChange={(v) => setField("tone", v)} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform Scope</label>
                  <CheckboxGroup options={PLATFORMS} selected={editData.platform_scope} onChange={(v) => setField("platform_scope", v as string[])} />
                </div>
                <EditableField label="Notes for AI" name="notes_for_ai" value={editData.notes_for_ai} onChange={(v) => setField("notes_for_ai", v)} maxLength={2000} rows={3} />
              </>
            ) : (
              <>
                <Field label="Target Audience" value={event.target_audience} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="CTA" value={event.cta} />
                  <Field label="Tone" value={event.tone} />
                </div>
                <Field label="Platform Scope" value={event.platform_scope?.join(", ") ?? null} />
                <Field label="Notes for AI" value={event.notes_for_ai} />
              </>
            )}
          </div>

          {/* Posting Schedule */}
          <div className="rounded-lg border border-border p-5 space-y-5">
            <h2 className="text-sm font-semibold">Posting Schedule</h2>
            {editing && editData ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frequency</label>
                  <Select value={editData.posting_frequency || "none"} onValueChange={(v) => setField("posting_frequency", v === "none" ? "" : (v ?? ""))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editData.posting_frequency && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</label>
                      <Select value={editData.posting_time} onValueChange={(v) => setField("posting_time", v ?? "15:00")}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{HOURS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    {editData.posting_frequency === "weekly" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Days</label>
                        <CheckboxGroup options={WEEKDAYS} selected={editData.posting_weekdays} onChange={(v) => setField("posting_weekdays", v as number[])} />
                      </div>
                    )}
                    {editData.posting_frequency === "monthly" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Days of Month</label>
                        <CheckboxGroup options={Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} selected={editData.posting_month_days} onChange={(v) => setField("posting_month_days", v as number[])} />
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editData.auto_generate_posts} onChange={(e) => setField("auto_generate_posts", e.target.checked)} className="h-4 w-4 rounded border-input" />
                    <span className="text-sm">Auto-generate drafts</span>
                  </label>
                </div>
              </>
            ) : (
              <>
                <Field label="Schedule" value={piSummary ?? "No posting schedule configured"} />
                <Field label="Auto-generate" value={event.auto_generate_posts ? "Yes" : "No"} />
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <Field label="Event Type" value={EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} />
            <Field label="Status" value={event.status.charAt(0).toUpperCase() + event.status.slice(1)} />
            <Field label="Start" value={formatDate(event.start_at)} />
            <Field label="End" value={formatDate(event.end_at)} />
            <Field label="Created By" value={event.creator?.name} />
            <Field label="Created" value={formatDate(event.created_at)} />
            <Field label="Updated" value={formatDate(event.updated_at)} />
          </div>
        </div>
      </div>
    </div>
  );
}
