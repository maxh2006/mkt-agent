"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { postsApi, type Post } from "@/lib/posts-api";
import { StatusBadge } from "@/components/posts/status-badge";
import { RejectDialog } from "@/components/posts/reject-dialog";
import { EditPostModal } from "@/components/posts/edit-post-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Pencil, ExternalLink, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Status gating (mirrors queue/[id] + queue/page.tsx conventions) ─────────

const APPROVE_REJECT_ALLOWED = new Set(["draft", "pending_approval"]);
const REFINE_ALLOWED = new Set(["draft", "pending_approval", "rejected"]);

function canApproveRole(role?: string) {
  return role === "admin" || role === "brand_manager";
}

function canEditRole(role?: string) {
  return role !== "viewer";
}

// ─── Source-type readable labels + identity extraction ───────────────────────

const SOURCE_TYPE_LABEL: Record<string, string> = {
  promo: "Promo",
  big_win: "Big Win",
  event: "Event",
  educational: "Educational",
  hot_games: "Hot Games",
};

const SOURCE_TYPE_TONE: Record<string, string> = {
  promo: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  big_win: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  event: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  educational: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  hot_games: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

interface SourceIdentity {
  label: string;
  detail: string | null;
}

function extractSourceIdentity(post: Post): SourceIdentity {
  const ctx = (post.generation_context_json ?? null) as Record<string, unknown> | null;
  const snapshot = ctx?.source_snapshot as Record<string, unknown> | null | undefined;
  const sourceType = post.source_type ?? "manual";
  const label = SOURCE_TYPE_LABEL[sourceType] ?? sourceType;

  // Pick a readable detail per source type. We tolerate missing fields —
  // the snapshot shape evolves and the comparison page should not break
  // when older drafts are surfaced.
  let detail: string | null = null;
  if (snapshot) {
    if (sourceType === "promo") {
      const name = (snapshot.promo_name as string) || (snapshot.title as string);
      detail = name ? `Running promotion: ${name}` : null;
    } else if (sourceType === "big_win") {
      const masked = snapshot.masked_username as string | undefined;
      const payout = snapshot.payout_label as string | undefined;
      detail = masked && payout ? `${masked} won ${payout}` : null;
    } else if (sourceType === "event") {
      const title = (post.event_title as string | null | undefined) ?? (snapshot.title as string | undefined);
      detail = title ? `Event: ${title}` : null;
    } else if (sourceType === "hot_games") {
      const scanAt = snapshot.scan_timestamp as string | undefined;
      detail = scanAt ? `Hot games scan: ${new Date(scanAt).toLocaleString()}` : null;
    } else if (sourceType === "educational") {
      const topic = (snapshot.topic as string) || (snapshot.title as string);
      detail = topic ? `Educational topic: ${topic}` : null;
    }
  }
  return { label, detail };
}

// ─── Image preview resolution: image_url → composited.artifact_url → null ───

function resolvePreviewUrl(post: Post): string | null {
  if (post.image_url && post.image_url.trim().length > 0) return post.image_url;
  const ctx = (post.generation_context_json ?? null) as Record<string, unknown> | null;
  const composited = ctx?.composited_image as Record<string, unknown> | null | undefined;
  const url = composited?.artifact_url as string | undefined;
  if (!url) return null;
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/")) {
    return url;
  }
  return null;
}

// ─── Sample sort: ascending by sample_index ──────────────────────────────────

function sampleIndex(post: Post): number {
  const ctx = post.generation_context_json as Record<string, unknown> | null | undefined;
  const idx = ctx?.sample_index;
  return typeof idx === "number" ? idx : 0;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CompareSamplesPage() {
  const { group_id } = useParams<{ group_id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canApprove = canApproveRole(role);
  const canEdit = canEditRole(role);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["posts", "sample-group", group_id],
    queryFn: () => postsApi.list({ sample_group_id: group_id, per_page: 200 }),
    enabled: !!group_id,
    retry: false,
  });

  const siblings = (data?.posts ?? []).slice().sort((a, b) => sampleIndex(a) - sampleIndex(b));

  // Singleton — redirect into the standard single-post detail surface.
  if (siblings.length === 1) {
    if (typeof window !== "undefined") router.replace(`/queue/${siblings[0].id}`);
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Opening sample…</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading samples…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/queue")}>
          <ArrowLeft className="h-4 w-4" />
          Queue
        </Button>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load samples"}
          </p>
        </div>
      </div>
    );
  }

  if (siblings.length === 0) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/queue")}>
          <ArrowLeft className="h-4 w-4" />
          Queue
        </Button>
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No samples found for this group. They may have been deleted, or you may not have access to this brand.
          </p>
        </div>
      </div>
    );
  }

  const first = siblings[0];
  const identity = extractSourceIdentity(first);
  const sourceTone = SOURCE_TYPE_TONE[first.source_type ?? "manual"] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/queue")} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
          Queue
        </Button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold">Compare {siblings.length} samples</h1>
            <Badge variant="outline" className={cn("whitespace-nowrap", sourceTone)}>
              {identity.label}
            </Badge>
          </div>
          {identity.detail && (
            <p className="text-sm text-muted-foreground">{identity.detail}</p>
          )}
          {first.brand && (
            <p className="text-xs text-muted-foreground">
              Brand: <span className="font-medium text-foreground">{first.brand.name}</span>
            </p>
          )}
        </div>
      </div>

      {/* Grid of sibling columns. Desktop-first: side-by-side; narrow viewports
          fall back to horizontal scroll so the cards never collapse / wrap. */}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-4 min-w-[680px]"
          style={{ gridTemplateColumns: `repeat(${siblings.length}, minmax(280px, 1fr))` }}
        >
          {siblings.map((post) => (
            <SiblingColumn
              key={post.id}
              post={post}
              canApprove={canApprove}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sibling column ──────────────────────────────────────────────────────────

interface SiblingColumnProps {
  post: Post;
  canApprove: boolean;
  canEdit: boolean;
}

function SiblingColumn({ post, canApprove, canEdit }: SiblingColumnProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const sample = post.sample_group;
  const previewUrl = resolvePreviewUrl(post);
  const status = post.status;

  const approveAllowed = canApprove && APPROVE_REJECT_ALLOWED.has(status);
  const rejectAllowed = canApprove && APPROVE_REJECT_ALLOWED.has(status);
  const refineAllowed = canEdit && REFINE_ALLOWED.has(status);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["post", post.id] });
  }

  async function handleApprove() {
    setActionError(null);
    setApproving(true);
    try {
      await postsApi.approve(post.id);
      invalidate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  }

  async function handleReject(reason?: string) {
    setActionError(null);
    try {
      await postsApi.reject(post.id, reason);
      invalidate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
      throw err;
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card flex flex-col">
      {/* Image preview area — fixed aspect so columns stay aligned */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-muted flex items-center justify-center">
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`Sample ${sample?.index ?? ""} preview`}
              className="h-full w-full object-cover transition-opacity hover:opacity-90"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6" aria-hidden />
            <span className="text-xs">No preview</span>
          </div>
        )}
      </div>

      {/* Header chip row */}
      <div className="flex items-center gap-2 px-4 pt-4">
        {sample && (
          <Badge variant="outline" className="whitespace-nowrap bg-muted/40 text-muted-foreground border-border">
            Sample {sample.index}/{sample.total}
          </Badge>
        )}
        <StatusBadge status={status} />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {post.headline && (
          <p className="text-base font-semibold leading-snug">{post.headline}</p>
        )}
        {post.caption && (
          <div>
            <p
              className={cn(
                "text-sm text-muted-foreground leading-relaxed whitespace-pre-line",
                !showFullCaption && "line-clamp-6",
              )}
            >
              {post.caption}
            </p>
            {post.caption.length > 240 && (
              <button
                type="button"
                onClick={() => setShowFullCaption((v) => !v)}
                className="text-xs text-primary mt-1 hover:underline"
              >
                {showFullCaption ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
        {post.cta && (
          <div>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {post.cta}
            </span>
          </div>
        )}
        {post.banner_text && (
          <p className="text-xs text-muted-foreground italic">Banner: {post.banner_text}</p>
        )}
      </div>

      {/* Action error */}
      {actionError && (
        <div className="mx-4 mb-3 rounded border border-destructive/20 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">{actionError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
        {approveAllowed ? (
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={approving}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {approving ? "…" : "Approve"}
          </Button>
        ) : canApprove ? (
          <Button size="sm" disabled title={`Already ${status}`} variant="outline">
            <CheckCircle className="h-3.5 w-3.5" />
            Approve
          </Button>
        ) : null}

        {rejectAllowed ? (
          <RejectDialog
            onReject={handleReject}
            trigger={
              <Button variant="destructive" size="sm">
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            }
          />
        ) : canApprove ? (
          <Button size="sm" disabled title={`Already ${status}`} variant="outline">
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
        ) : null}

        {refineAllowed && (
          <Button variant="outline" size="sm" onClick={() => setRefineOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Refine
          </Button>
        )}

        <Link href={`/queue/${post.id}`} className="ml-auto">
          <Button variant="ghost" size="sm">
            <ExternalLink className="h-3.5 w-3.5" />
            Details
          </Button>
        </Link>
      </div>

      {refineAllowed && (
        <EditPostModal
          post={post}
          open={refineOpen}
          onClose={() => {
            setRefineOpen(false);
            invalidate();
          }}
        />
      )}
    </article>
  );
}
