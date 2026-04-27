"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { postsApi, type Post } from "@/lib/posts-api";
import { StatusBadge } from "@/components/posts/status-badge";
import { RejectDialog } from "@/components/posts/reject-dialog";
import { ScheduleDialog } from "@/components/posts/schedule-dialog";
import {
  ImageInspectorModal,
  postHasImageInspectorData,
} from "@/components/posts/image-inspector-modal";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, CheckCircle, XCircle, CalendarClock, X, Save, ImageIcon } from "lucide-react";

function canApproveRole(role?: string) {
  return role === "admin" || role === "brand_manager";
}

function canEditStatus(status: string) {
  return status === "draft" || status === "rejected";
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

// ------- Field display helpers -------

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground italic">—</span>}</p>
    </div>
  );
}

function EditableField({
  label,
  name,
  value,
  onChange,
  maxLength,
  rows = 1,
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
      <label htmlFor={name} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {rows > 1 ? (
        <textarea
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={rows}
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <input
          id={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}
      <p className="text-xs text-muted-foreground text-right">{value.length}/{maxLength}</p>
    </div>
  );
}

// ------- Main page -------

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canApprove = canApproveRole(session?.user?.role);

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const { data: post, isLoading, isError, error } = useQuery({
    queryKey: ["post", id],
    queryFn: () => postsApi.get(id),
    enabled: !!id,
    retry: false,
  });

  function startEdit(post: Post) {
    setEditData({
      headline: post.headline ?? "",
      caption: post.caption ?? "",
      cta: post.cta ?? "",
      banner_text: post.banner_text ?? "",
      image_prompt: post.image_prompt ?? "",
      image_url: post.image_url ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditData({});
    setSaveError(null);
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError(null);
    try {
      // Strip empty strings to undefined so the API doesn't overwrite with blank
      const payload: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(editData)) {
        payload[k] = v.trim() || undefined;
      }
      await postsApi.update(id, payload);
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setActionError(null);
    try {
      await postsApi.approve(id);
      queryClient.invalidateQueries({ queryKey: ["post", id] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    }
  }

  async function handleReject(reason?: string) {
    await postsApi.reject(id, reason);
    queryClient.invalidateQueries({ queryKey: ["post", id] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  async function handleSchedule(scheduledAt: string) {
    await postsApi.schedule(id, scheduledAt);
    queryClient.invalidateQueries({ queryKey: ["post", id] });
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  // ------- Render states -------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading post…</p>
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
            {error instanceof Error ? error.message : "Failed to load post"}
          </p>
        </div>
      </div>
    );
  }

  if (!post) return null;

  const showApprove = canApprove && post.status === "pending_approval";
  const showReject = canApprove && post.status === "pending_approval";
  const showSchedule = canApprove && post.status === "approved";
  const showEdit = canEditStatus(post.status);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back nav + title row */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          Queue
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">
              {post.headline ?? post.caption?.slice(0, 80) ?? "Post Detail"}
            </h1>
            <StatusBadge status={post.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {post.platform} · {post.post_type} · Created by {post.creator?.name ?? "—"} · {formatDate(post.created_at)}
          </p>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{actionError}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {showEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => startEdit(post)}>
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

        {showApprove && (
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleApprove}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Approve
          </Button>
        )}

        {showReject && (
          <RejectDialog
            onReject={handleReject}
            trigger={
              <Button variant="destructive" size="sm">
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            }
          />
        )}

        {showSchedule && (
          <ScheduleDialog
            onSchedule={handleSchedule}
            trigger={
              <Button variant="outline" size="sm">
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule
              </Button>
            }
          />
        )}
      </div>

      {/* Main layout: content + preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: content fields */}
        <div className="space-y-4">
          {(post.rejected_reason || post.rejected_at) && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-1">
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">Rejection</p>
              {post.rejected_reason && <p className="text-sm">{post.rejected_reason}</p>}
              <p className="text-xs text-muted-foreground">
                {post.rejected_at && <>Rejected {new Date(post.rejected_at).toLocaleString()}</>}
                {post.rejected_at && post.rejected_by && " · "}
                {post.rejected_by && <>by user {post.rejected_by}</>}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border p-5 space-y-5">
            <h2 className="text-sm font-semibold">Post Content</h2>

            {saveError && (
              <p className="text-xs text-destructive">{saveError}</p>
            )}

            {editing ? (
              <>
                <EditableField
                  label="Headline"
                  name="headline"
                  value={editData.headline ?? ""}
                  onChange={(v) => setEditData((d) => ({ ...d, headline: v }))}
                  maxLength={300}
                />
                <EditableField
                  label="Caption"
                  name="caption"
                  value={editData.caption ?? ""}
                  onChange={(v) => setEditData((d) => ({ ...d, caption: v }))}
                  maxLength={2200}
                  rows={5}
                />
                <EditableField
                  label="CTA"
                  name="cta"
                  value={editData.cta ?? ""}
                  onChange={(v) => setEditData((d) => ({ ...d, cta: v }))}
                  maxLength={200}
                />
                <EditableField
                  label="Banner Text"
                  name="banner_text"
                  value={editData.banner_text ?? ""}
                  onChange={(v) => setEditData((d) => ({ ...d, banner_text: v }))}
                  maxLength={200}
                />
                <EditableField
                  label="Image Prompt"
                  name="image_prompt"
                  value={editData.image_prompt ?? ""}
                  onChange={(v) => setEditData((d) => ({ ...d, image_prompt: v }))}
                  maxLength={1000}
                  rows={3}
                />
                <div className="space-y-1">
                  <EditableField
                    label="Image URL"
                    name="image_url"
                    value={editData.image_url ?? ""}
                    onChange={(v) => setEditData((d) => ({ ...d, image_url: v }))}
                    maxLength={2048}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Public URL for publishing. Must be reachable (http or https). Leave blank for text-only posts.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Field label="Headline" value={post.headline} />
                <Field label="Caption" value={post.caption} />
                <Field label="CTA" value={post.cta} />
                <Field label="Banner Text" value={post.banner_text} />
                <Field label="Image Prompt" value={post.image_prompt} />
                <Field label="Image URL" value={post.image_url} />
              </>
            )}
          </div>

          {/* Source info */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold">Source &amp; Tracking</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Source Type" value={post.source_type} />
              {post.source_type === "event" && post.source_id ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source Event</p>
                  <a href={`/events/${post.source_id}`} className="text-sm text-primary hover:underline">
                    {post.event_title ?? post.source_id}
                  </a>
                </div>
              ) : (
                <Field label="Source ID" value={post.source_id} />
              )}
              <Field label="Tracking ID" value={post.tracking_id} />
              {post.source_instance_key && (
                <Field label="Occurrence" value={new Date(post.source_instance_key).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} />
              )}
            </div>
          </div>
        </div>

        {/* Right: preview + metadata */}
        <div className="space-y-4">
          {/* Preview panel */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Preview</h2>
              {postHasImageInspectorData(post) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectorOpen(true)}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Image Inspector
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="No image-related metadata for this draft"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Image Inspector
                </Button>
              )}
            </div>
            <PostPreview
              post={editing ? { ...post, ...editData } : post}
            />
          </div>

          {/* Metadata */}
          <div className="rounded-lg border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Platform" value={post.platform} />
              <Field label="Post Type" value={post.post_type} />
              <Field label="Status" value={post.status} />
              <Field label="Created By" value={post.creator?.name} />
              <Field label="Approved By" value={post.approver?.name} />
              <Field label="Scheduled At" value={formatDate(post.scheduled_at)} />
              <Field label="Posted At" value={formatDate(post.posted_at)} />
              <Field label="Created At" value={formatDate(post.created_at)} />
            </div>
          </div>
        </div>
      </div>

      <ImageInspectorModal
        post={post}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />
    </div>
  );
}

// ------- Preview -------

type PreviewPost = Post & { headline?: string | null; caption?: string | null; cta?: string | null; banner_text?: string | null };

function PostPreview({ post }: { post: PreviewPost }) {
  const headline = post.headline;
  const caption = post.caption;
  const cta = post.cta;
  const bannerText = post.banner_text;
  const imageUrl = post.image_url;

  const hasContent = headline || caption || cta || bannerText;

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      {/* Image / banner area. When image_url is set we render it directly;
          banner_text renders over a muted background as today otherwise. */}
      <div className="relative flex items-center justify-center bg-muted h-40 overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Post media"
            className="h-full w-full object-cover"
            onError={(e) => {
              // If the URL fails to load, fall back to the banner_text
              // placeholder by hiding the broken img. Pre-dispatch
              // validation catches unreachable URLs before publishing;
              // this keeps the preview resilient to CORS / hotlink
              // blocking that can affect browser fetches but not
              // Manus's server-side fetch.
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : bannerText ? (
          <div className="flex items-center justify-center rounded-lg bg-primary/10 px-6 py-3 max-w-[80%]">
            <p className="text-center text-sm font-semibold text-primary">{bannerText}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No banner text</p>
        )}
      </div>

      {/* Caption area */}
      <div className="p-4 space-y-2">
        {!hasContent && (
          <p className="text-xs text-muted-foreground italic">No content yet.</p>
        )}
        {headline && (
          <p className="font-semibold text-sm leading-snug">{headline}</p>
        )}
        {caption && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">{caption}</p>
        )}
        {cta && (
          <div className="pt-1">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {cta}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
