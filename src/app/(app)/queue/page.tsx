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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Eye, CheckCircle, XCircle, CalendarClock } from "lucide-react";

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

const PER_PAGE = 25;

function canApproveRole(role?: string) {
  return role === "admin" || role === "brand_manager";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function platformLabel(platform: string) {
  return PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
}

function postTypeLabel(type: string) {
  return POST_TYPES.find((t) => t.value === type)?.label ?? type;
}

export default function ContentQueuePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const canApprove = canApproveRole(session?.user?.role);
  const { isAllBrands } = useActiveBrand();

  const [filters, setFilters] = useState<PostFilters>({
    page: 1,
    per_page: PER_PAGE,
  });

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
        <Select
          value={filters.status ?? ""}
          onValueChange={(v) => setFilter("status", v ?? "")}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.platform ?? ""}
          onValueChange={(v) => setFilter("platform", v ?? "")}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="All Platforms" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.post_type ?? ""}
          onValueChange={(v) => setFilter("post_type", v ?? "")}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            {POST_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load posts"}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Loading posts…</p>
        </div>
      )}

      {/* Table */}
      {data && !isError && (
        <>
          {data.posts.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No posts match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Content</th>
                    {isAllBrands && <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Brand</th>}
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Platform</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Scheduled</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.posts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      canApprove={canApprove}
                      isAllBrands={isAllBrands}
                      onView={() => router.push(`/queue/${post.id}`)}
                      onApprove={() => handleApprove(post.id)}
                      onReject={(reason) => handleReject(post.id, reason)}
                      onSchedule={(scheduledAt) => handleSchedule(post.id, scheduledAt)}
                      platformLabel={platformLabel(post.platform)}
                      postTypeLabel={postTypeLabel(post.post_type)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {data.total} post{data.total !== 1 ? "s" : ""} — page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface PostRowProps {
  post: Post;
  canApprove: boolean;
  isAllBrands: boolean;
  onView: () => void;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onSchedule: (scheduledAt: string) => Promise<void>;
  platformLabel: string;
  postTypeLabel: string;
}

function PostRow({
  post,
  canApprove,
  isAllBrands,
  onView,
  onApprove,
  onReject,
  onSchedule,
  platformLabel,
  postTypeLabel,
}: PostRowProps) {
  const [approving, setApproving] = useState(false);

  const title = post.headline ?? post.caption ?? "(no content)";
  const showApprove = canApprove && post.status === "pending_approval";
  const showReject = canApprove && post.status === "pending_approval";
  const showSchedule = canApprove && post.status === "approved";

  async function handleApprove() {
    setApproving(true);
    try {
      await onApprove();
    } finally {
      setApproving(false);
    }
  }

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 max-w-xs">
        <p className="truncate font-medium">{title}</p>
        {post.creator && (
          <p className="text-xs text-muted-foreground truncate">{post.creator.name}</p>
        )}
      </td>
      {isAllBrands && (
        <td className="px-4 py-3 text-muted-foreground">{post.brand?.name ?? "—"}</td>
      )}
      <td className="px-4 py-3 text-muted-foreground">{platformLabel}</td>
      <td className="px-4 py-3 text-muted-foreground">{postTypeLabel}</td>
      <td className="px-4 py-3">
        <StatusBadge status={post.status} />
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {formatDate(post.scheduled_at)}
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {formatDate(post.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={onView} title="View post">
            <Eye className="h-4 w-4" />
          </Button>

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
