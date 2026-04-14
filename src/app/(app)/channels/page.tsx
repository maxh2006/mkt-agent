"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { channelsApi, type Channel } from "@/lib/channels-api";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  CHANNEL_STATUSES,
  CHANNEL_STATUS_LABELS,
  type ChannelStatus,
} from "@/lib/validations/channel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Wifi, WifiOff, AlertCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Permission helper ────────────────────────────────────────────────────────

function canEditChannels(role?: string) {
  return role === "admin" || role === "brand_manager";
}

// ─── Status presentation ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ChannelStatus,
  { label: string; className: string; Icon: React.ElementType }
> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
    Icon: Wifi,
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-muted text-muted-foreground border-border",
    Icon: WifiOff,
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    Icon: AlertCircle,
  },
  disabled: {
    label: "Disabled",
    className: "bg-muted/50 text-muted-foreground/60 border-border",
    Icon: Ban,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ChannelStatus] ?? STATUS_CONFIG.disconnected;
  return (
    <Badge variant="outline" className={cn("gap-1", cfg.className)}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Shared form state + fields ───────────────────────────────────────────────

interface ChannelFormData {
  platform: string;
  account_name: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: ChannelFormData = {
  platform: "",
  account_name: "",
  status: "disconnected",
  notes: "",
};

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function FormField({
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

interface FormErrors {
  platform?: string;
  account_name?: string;
}

function validateForm(data: ChannelFormData, isCreate: boolean): FormErrors {
  const errors: FormErrors = {};
  if (isCreate && !data.platform) errors.platform = "Platform is required";
  if (!data.account_name.trim()) errors.account_name = "Account name is required";
  return errors;
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateChannelDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ChannelFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: keyof ChannelFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateForm(form, true);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await channelsApi.create({
        platform: form.platform,
        account_name: form.account_name.trim(),
        status: form.status as ChannelStatus,
        notes: form.notes.trim() || undefined,
      });
      onCreated();
      setOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!submitting) {
      setOpen(next);
      if (!next) {
        setForm(EMPTY_FORM);
        setErrors({});
        setSubmitError(null);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        Add Channel
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <p className="text-xs text-destructive">{submitError}</p>
          )}

          <FormField label="Platform" required error={errors.platform}>
            <Select
              value={form.platform}
              onValueChange={(v) => set("platform", v ?? "")}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select platform…" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Account name" required error={errors.account_name}>
            <input
              type="text"
              value={form.account_name}
              onChange={(e) => set("account_name", e.target.value)}
              maxLength={255}
              placeholder="@handle or page name"
              className={inputClass}
              disabled={submitting}
            />
          </FormField>

          <FormField label="Initial status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v ?? "disconnected")}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CHANNEL_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Optional operator notes about this connection"
              className={inputClass + " resize-none"}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground text-right">{form.notes.length}/500</p>
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add Channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

function EditChannelDialog({
  channel,
  onUpdated,
}: {
  channel: Channel;
  onUpdated: () => void;
}) {
  const existingNotes = (channel.config_json?.notes as string) ?? "";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ChannelFormData>({
    platform: channel.platform,
    account_name: channel.account_name,
    status: channel.status,
    notes: existingNotes,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: keyof ChannelFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateForm(form, false);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await channelsApi.update(channel.id, {
        account_name: form.account_name.trim(),
        status: form.status as ChannelStatus,
        notes: form.notes.trim() || undefined,
      });
      onUpdated();
      setOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to update channel");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!submitting) {
      setOpen(next);
      if (!next) {
        setErrors({});
        setSubmitError(null);
      }
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" title="Edit channel" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <p className="text-xs text-destructive">{submitError}</p>
          )}

          {/* Platform is not editable — changing it would require a new channel record */}
          <div className="space-y-1.5">
            <p className="block text-sm font-medium text-muted-foreground">Platform</p>
            <p className="text-sm">{PLATFORM_LABELS[channel.platform] ?? channel.platform}</p>
          </div>

          <FormField label="Account name" required error={errors.account_name}>
            <input
              type="text"
              value={form.account_name}
              onChange={(e) => set("account_name", e.target.value)}
              maxLength={255}
              placeholder="@handle or page name"
              className={inputClass}
              disabled={submitting}
            />
          </FormField>

          <FormField label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v ?? form.status)}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CHANNEL_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Optional operator notes about this connection"
              className={inputClass + " resize-none"}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground text-right">{form.notes.length}/500</p>
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Channel card ─────────────────────────────────────────────────────────────

function ChannelCard({
  channel,
  canEdit,
  onUpdated,
}: {
  channel: Channel;
  canEdit: boolean;
  onUpdated: () => void;
}) {
  const notes = channel.config_json?.notes as string | undefined;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium">{channel.account_name}</p>
          <StatusBadge status={channel.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {PLATFORM_LABELS[channel.platform] ?? channel.platform}
        </p>
        {channel.status === "error" && channel.last_error && (
          <p className="text-xs text-destructive mt-1">{channel.last_error}</p>
        )}
        {notes && (
          <p className="text-xs text-muted-foreground mt-1">{notes}</p>
        )}
        <div className="flex gap-4 text-xs text-muted-foreground mt-1">
          {channel.last_sync_at && (
            <span>Last sync: {formatDate(channel.last_sync_at)}</span>
          )}
          <span>Added: {formatDate(channel.created_at)}</span>
        </div>
      </div>

      {canEdit && (
        <EditChannelDialog channel={channel} onUpdated={onUpdated} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChannelsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canEdit = canEditChannels(session?.user?.role);

  const { data: channels, isLoading, isError, error } = useQuery({
    queryKey: ["channels"],
    queryFn: channelsApi.list,
    retry: false,
  });

  const isNoBrand =
    isError && error instanceof Error && error.message.includes("No active brand");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["channels"] });
  }

  // Group channels by platform for display
  const byPlatform = new Map<string, Channel[]>();
  for (const ch of channels ?? []) {
    const list = byPlatform.get(ch.platform) ?? [];
    list.push(ch);
    byPlatform.set(ch.platform, list);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Channels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-brand social platform connections and publishing targets.
          </p>
        </div>
        {canEdit && <CreateChannelDialog onCreated={invalidate} />}
      </div>

      {/* States */}
      {isNoBrand && (
        <div className="rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium">No active brand selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the brand switcher in the top bar to select a brand.
          </p>
        </div>
      )}

      {isError && !isNoBrand && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load channels"}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card h-20 animate-pulse" />
          ))}
        </div>
      )}

      {channels && !isError && channels.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm font-medium">No channels configured</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canEdit
              ? "Add a channel to connect a social platform account to this brand."
              : "No channels have been configured for this brand yet."}
          </p>
        </div>
      )}

      {/* Channel groups */}
      {channels && !isError && channels.length > 0 && (
        <div className="space-y-6">
          {[...byPlatform.entries()].map(([platform, platformChannels]) => (
            <div key={platform} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {PLATFORM_LABELS[platform] ?? platform}
              </p>
              {platformChannels.map((channel) => (
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  canEdit={canEdit}
                  onUpdated={invalidate}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
