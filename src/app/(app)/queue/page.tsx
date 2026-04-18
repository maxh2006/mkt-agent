"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { postsApi, type Post, type PostFilters } from "@/lib/posts-api";
import { useActiveBrand } from "@/lib/active-brand-client";
import { StatusBadge } from "@/components/posts/status-badge";
import { RejectDialog } from "@/components/posts/reject-dialog";
import { ScheduleDialog } from "@/components/posts/schedule-dialog";
import { EditPostModal } from "@/components/posts/edit-post-modal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  XCircle,
  CalendarClock,
  Pencil,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "posted", label: "Posted" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
];

const PLATFORMS = [
  { value: "", label: "All Platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter/X" },
  { value: "tiktok", label: "TikTok" },
  { value: "telegram", label: "Telegram" },
];

const POST_TYPES = [
  { value: "", label: "All Types" },
  { value: "promo", label: "Running Promotion" },
  { value: "big_win", label: "Big Win" },
  { value: "event", label: "Adhoc Event" },
  { value: "educational", label: "Educational" },
];

const PLATFORM_STYLE: Record<string, { abbr: string; className: string }> = {
  instagram: { abbr: "IG", className: "bg-pink-500/10 text-pink-700 border-pink-500/20" },
  facebook:  { abbr: "FB", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  twitter:   { abbr: "TW", className: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  tiktok:    { abbr: "TK", className: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
  telegram:  { abbr: "TG", className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
};

const POST_TYPE_STYLE: Record<string, { label: string; className: string }> = {
  promo:       { label: "Promo",  className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  big_win:     { label: "Win",    className: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  event:       { label: "Event",  className: "bg-violet-500/10 text-violet-700 border-violet-500/20" },
  educational: { label: "Edu",    className: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
};

// Deterministic color dot for brands (no primary_color in BrandRef)
const BRAND_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];
function brandDotColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BRAND_COLORS[h % BRAND_COLORS.length];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowMidnight = new Date(todayMidnight.getTime() + 86_400_000);
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (dateMidnight.getTime() === todayMidnight.getTime()) return `Today, ${time}`;
  if (dateMidnight.getTime() === tomorrowMidnight.getTime()) return `Tomorrow, ${time}`;
  const datePart = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${datePart}, ${time}`;
}

function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Compact cells ────────────────────────────────────────────────────────────

function ThumbnailCell({ platform }: { platform: string }) {
  const cfg = PLATFORM_STYLE[platform];
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
        cfg?.className ?? "bg-muted text-muted-foreground border-border"
      )}
    >
      {cfg ? cfg.abbr : <ImageIcon className="h-4 w-4" />}
    </div>
  );
}

function PlatformTag({ platform }: { platform: string }) {
  const cfg = PLATFORM_STYLE[platform];
  if (!cfg) return <span className="text-xs text-muted-foreground">{platform}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold",
        cfg.className
      )}
    >
      {cfg.abbr}
    </span>
  );
}

function PostTypeTag({ postType }: { postType: string }) {
  const cfg = POST_TYPE_STYLE[postType];
  if (!cfg) return <span className="text-xs text-muted-foreground">{postType}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium",
        cfg.className
      )}
    >
      {cfg.label}
    </span>
  );
}

function BrandCell({ name }: { name: string }) {
  const color = brandDotColor(name);
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full border"
        style={{ backgroundColor: color }}
      />
      <span className="truncate text-sm">{name}</span>
    </div>
  );
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

function canApproveRole(role?: string) {
  return role === "admin" || role === "brand_manager";
}

const EDITABLE_STATUSES = new Set(["draft", "pending_approval", "rejected"]);

const PER_PAGE = 25;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentQueuePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canApprove = canApproveRole(session?.user?.role);
  const { isAllBrands } = useActiveBrand();

  const [filters, setFilters] = useState<PostFilters>({ page: 1, per_page: PER_PAGE });
  const [editPost, setEditPost] = useState<Post | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["posts", filters],
    queryFn: () => postsApi.list(filters),
    retry: false,
  });

  function setFilter(key: keyof PostFilters, value: string | number | undefined) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }));
  }

  function setPage(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  async function handleApprove(id: string) {
    await postsApi.approve(id);
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  async function handleReject(id: string, reason?: string) {
    await postsApi.reject(id, reason);
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  async function handleSchedule(id: string, scheduledAt: string) {
    await postsApi.schedule(id, scheduledAt);
    queryClient.invalidateQueries({ queryKey: ["posts"] });
  }

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;
  const currentPage = filters.page ?? 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Content Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review, approve, and schedule posts.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filters.status ?? ""} onValueChange={(v) => setFilter("status", v ?? undefined)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.platform ?? ""} onValueChange={(v) => setFilter("platform", v ?? undefined)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.post_type ?? ""} onValueChange={(v) => setFilter("post_type", v ?? undefined)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            {POST_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load posts"}
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Loading posts…</p>
        </div>
      )}

      {/* Table — always rendered once data resolves, empty state as a tbody row */}
      {!isLoading && !isError && (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    {isAllBrands && (
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                        Brand
                      </th>
                    )}
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-12">
                      {/* Thumbnail */}
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                      Preview
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Type
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Platform
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Recurrence
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                      Scheduled
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                      Created
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {!data || data.posts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAllBrands ? 10 : 9}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No posts match the current filters.
                      </td>
                    </tr>
                  ) : (
                    data.posts.map((post) => (
                      <PostRow
                        key={post.id}
                        post={post}
                        canApprove={canApprove}
                        isAllBrands={isAllBrands}
                        onView={() => router.push(`/queue/${post.id}`)}
                        onApprove={() => handleApprove(post.id)}
                        onReject={(reason) => handleReject(post.id, reason)}
                        onSchedule={(scheduledAt) => handleSchedule(post.id, scheduledAt)}
                        onEdit={() => setEditPost(post)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {data?.total} post{data?.total !== 1 ? "s" : ""} — page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      <EditPostModal
        post={editPost}
        open={editPost !== null}
        onClose={() => setEditPost(null)}
      />
    </div>
  );
}

// ─── PostRow ──────────────────────────────────────────────────────────────────

interface PostRowProps {
  post: Post;
  canApprove: boolean;
  isAllBrands: boolean;
  onView: () => void;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onSchedule: (scheduledAt: string) => Promise<void>;
  onEdit: () => void;
}

function PostRow({
  post,
  canApprove,
  isAllBrands,
  onView,
  onApprove,
  onReject,
  onSchedule,
  onEdit,
}: PostRowProps) {
  const [approving, setApproving] = useState(false);

  const previewPrimary = post.headline ?? post.caption ?? "(no content)";
  const previewSecondary = post.headline && post.caption ? post.caption : null;

  const showApprove  = canApprove && post.status === "pending_approval";
  const showReject   = canApprove && post.status === "pending_approval";
  const showSchedule = canApprove && post.status === "approved";
  const showEdit     = EDITABLE_STATUSES.has(post.status);

  async function handleApprove() {
    setApproving(true);
    try { await onApprove(); } finally { setApproving(false); }
  }

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      {/* Brand */}
      {isAllBrands && (
        <td className="px-3 py-3 max-w-[140px]">
          {post.brand ? (
            <BrandCell name={post.brand.name} />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      )}

      {/* Thumbnail */}
      <td className="px-3 py-3">
        <ThumbnailCell platform={post.platform} />
      </td>

      {/* Preview — widest column */}
      <td className="px-3 py-3 max-w-xs md:max-w-sm lg:max-w-md">
        <p className="truncate font-medium leading-snug">{previewPrimary}</p>
        {previewSecondary && (
          <p className="truncate text-xs text-muted-foreground mt-0.5 leading-snug">
            {previewSecondary}
          </p>
        )}
        {post.creator && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{post.creator.name}</p>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <StatusBadge status={post.status} />
      </td>

      {/* Post Type */}
      <td className="px-3 py-3">
        <PostTypeTag postType={post.post_type} />
      </td>

      {/* Platform */}
      <td className="px-3 py-3">
        <PlatformTag platform={post.platform} />
      </td>

      {/* Recurrence */}
      <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
        {post.event_posting_summary ?? "—"}
      </td>

      {/* Scheduled */}
      <td className="px-3 py-3 whitespace-nowrap text-sm text-muted-foreground">
        {formatScheduledAt(post.scheduled_at)}
      </td>

      {/* Created — hidden on xs */}
      <td className="px-3 py-3 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground/70">
          {formatCreatedAt(post.created_at)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon" onClick={onView} title="View">
            <Eye className="h-4 w-4" />
          </Button>

          {showEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              title="Edit with AI"
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}

          {showApprove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleApprove}
              disabled={approving}
              title="Approve"
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
          )}

          {showReject && (
            <RejectDialog
              onReject={onReject}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reject"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              }
            />
          )}

          {showSchedule && (
            <ScheduleDialog
              onSchedule={onSchedule}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  title="Schedule"
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              }
            />
          )}
        </div>
      </td>
    </tr>
  );
}
