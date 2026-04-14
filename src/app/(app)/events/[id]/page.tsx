"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { eventsApi, type Event } from "@/lib/events-api";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EVENT_STATUSES,
} from "@/lib/validations/event";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  ended: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted/50 text-muted-foreground/60 border-border",
};

function canEditRole(role?: string) {
  return role === "admin" || role === "brand_manager" || role === "operator";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Convert ISO string to datetime-local input value
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Field display ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="italic text-muted-foreground">—</span>}</p>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const textareaClass = inputClass + " resize-y";

function EditableField({
  label,
  name,
  value,
  onChange,
  maxLength,
  rows,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {rows ? (
        <textarea
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={rows}
          className={textareaClass}
        />
      ) : (
        <input
          id={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className={inputClass}
        />
      )}
      <p className="text-right text-xs text-muted-foreground">{value.length}/{maxLength}</p>
    </div>
  );
}

// ─── Edit state initializer ───────────────────────────────────────────────────

interface EditData {
  title: string;
  event_type: string;
  status: string;
  objective: string;
  rules: string;
  reward: string;
  start_at: string;
  end_at: string;
  theme: string;
}

function initEditData(event: Event): EditData {
  return {
    title: event.title,
    event_type: event.event_type,
    status: event.status,
    objective: event.objective ?? "",
    rules: event.rules ?? "",
    reward: event.reward ?? "",
    start_at: toDatetimeLocal(event.start_at),
    end_at: toDatetimeLocal(event.end_at),
    theme: event.theme ?? "",
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

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

  const { data: event, isLoading, isError, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => eventsApi.get(id),
    enabled: !!id,
    retry: false,
  });

  function startEdit(ev: Event) {
    setEditData(initEditData(ev));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditData(null);
    setSaveError(null);
  }

  function setField<K extends keyof EditData>(key: K, value: EditData[K]) {
    setEditData((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function saveEdit() {
    if (!editData) return;

    // Client-side date range guard — backend also validates, this avoids a round-trip.
    if (
      editData.start_at &&
      editData.end_at &&
      new Date(editData.end_at) <= new Date(editData.start_at)
    ) {
      setSaveError("End date must be after start date");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        title: editData.title.trim(),
        event_type: editData.event_type,
        status: editData.status,
      };
      if (editData.objective.trim()) payload.objective = editData.objective.trim();
      if (editData.rules.trim()) payload.rules = editData.rules.trim();
      if (editData.reward.trim()) payload.reward = editData.reward.trim();
      if (editData.theme.trim()) payload.theme = editData.theme.trim();
      if (editData.start_at) payload.start_at = new Date(editData.start_at).toISOString();
      if (editData.end_at) payload.end_at = new Date(editData.end_at).toISOString();

      await eventsApi.update(id, payload);
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setEditing(false);
      setEditData(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ─── Render states ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading event…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load event"}
          </p>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back + title */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          Events
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{event.title}</h1>
            <Badge
              variant="outline"
              className={cn(STATUS_COLORS[event.status] ?? "bg-muted text-muted-foreground border-border")}
            >
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
            {" · "}Created by {event.creator?.name ?? "—"}
            {" · "}{formatDate(event.created_at)}
          </p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => startEdit(event)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
        {editing && (
          <>
            <Button size="sm" onClick={saveEdit} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main content — 2 cols */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-lg border border-border p-5 space-y-5">
            <h2 className="text-sm font-semibold">Event Details</h2>

            {saveError && (
              <p className="text-xs text-destructive">{saveError}</p>
            )}

            {editing && editData ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={editData.title}
                    onChange={(e) => setField("title", e.target.value)}
                    maxLength={255}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Event Type <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={editData.event_type}
                      onValueChange={(v) => setField("event_type", v ?? editData.event_type)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {EVENT_TYPE_LABELS[t] ?? t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </label>
                    <Select
                      value={editData.status}
                      onValueChange={(v) => setField("status", v ?? editData.status)}
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
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Start Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editData.start_at}
                      onChange={(e) => setField("start_at", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      End Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editData.end_at}
                      onChange={(e) => setField("end_at", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <EditableField
                  label="Theme"
                  name="theme"
                  value={editData.theme}
                  onChange={(v) => setField("theme", v)}
                  maxLength={255}
                />

                <EditableField
                  label="Objective"
                  name="objective"
                  value={editData.objective}
                  onChange={(v) => setField("objective", v)}
                  maxLength={1000}
                  rows={3}
                />

                <EditableField
                  label="Rules"
                  name="rules"
                  value={editData.rules}
                  onChange={(v) => setField("rules", v)}
                  maxLength={2000}
                  rows={4}
                />

                <EditableField
                  label="Reward"
                  name="reward"
                  value={editData.reward}
                  onChange={(v) => setField("reward", v)}
                  maxLength={500}
                />
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
        </div>

        {/* Sidebar metadata — 1 col */}
        <div className="space-y-5">
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <Field label="Event Type" value={EVENT_TYPE_LABELS[event.event_type] ?? event.event_type} />
            <Field label="Status" value={event.status.charAt(0).toUpperCase() + event.status.slice(1)} />
            <Field label="Start" value={formatDate(event.start_at)} />
            <Field label="End" value={formatDate(event.end_at)} />
            <Field label="Theme" value={event.theme} />
            <Field label="Created By" value={event.creator?.name} />
            <Field label="Created" value={formatDate(event.created_at)} />
            <Field label="Updated" value={formatDate(event.updated_at)} />
          </div>
        </div>
      </div>
    </div>
  );
}
