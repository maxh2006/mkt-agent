"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Post } from "@/lib/posts-api";
import { formatCardTime, getPostDate } from "@/lib/calendar-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, CalendarClock, ExternalLink, ImageIcon } from "lucide-react";

const PLATFORM_STYLE: Record<string, { abbr: string; label: string; className: string }> = {
  instagram: { abbr: "IG", label: "Instagram", className: "bg-pink-500/10 text-pink-700 border-pink-500/20" },
  facebook:  { abbr: "FB", label: "Facebook",  className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  twitter:   { abbr: "TW", label: "Twitter/X", className: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  tiktok:    { abbr: "TK", label: "TikTok",    className: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
  telegram:  { abbr: "TG", label: "Telegram",  className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
};

const POST_TYPE_LABELS: Record<string, string> = {
  promo: "Running Promotion",
  big_win: "Big Win",
  event: "Adhoc Event",
  educational: "Educational",
};

const BRAND_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

function brandDotColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BRAND_COLORS[h % BRAND_COLORS.length];
}

function getBrandColor(post: Post): string {
  return post.brand?.primary_color ?? brandDotColor(post.brand?.name ?? "");
}

function PlatformTag({ platform }: { platform: string }) {
  const cfg = PLATFORM_STYLE[platform];
  if (!cfg) return <span className="text-[10px] text-muted-foreground">{platform}</span>;
  return (
    <span className={cn(
      "inline-flex items-center rounded border px-1 py-0 text-[10px] font-semibold leading-4",
      cfg.className,
    )}>
      {cfg.abbr}
    </span>
  );
}

function BrandDot({ post, className }: { post: Post; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: getBrandColor(post) }}
    />
  );
}

const STATUS_CARD_STYLES = {
  posted: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-500/5",
    hoverBg: "hover:bg-emerald-500/10",
    compactBg: "bg-emerald-500/5",
    compactHover: "hover:bg-emerald-500/10",
  },
  scheduled: {
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
    hoverBg: "hover:bg-amber-500/10",
    compactBg: "bg-amber-500/5",
    compactHover: "hover:bg-amber-500/10",
  },
} as const;

function getStatusStyle(status: string) {
  return STATUS_CARD_STYLES[status as keyof typeof STATUS_CARD_STYLES] ?? STATUS_CARD_STYLES.scheduled;
}

function StatusIndicator({ status }: { status: string }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] font-medium leading-4 bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded border px-1 py-0 text-[10px] font-medium leading-4 bg-amber-500/10 text-amber-700 border-amber-500/20">
      <CalendarClock className="h-2.5 w-2.5" />
      Scheduled
    </span>
  );
}

function formatDetailTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function PostDetailDialog({ post, open, onClose, showBrand }: {
  post: Post;
  open: boolean;
  onClose: () => void;
  showBrand: boolean;
}) {
  const router = useRouter();
  const dateStr = getPostDate(post);
  const platformCfg = PLATFORM_STYLE[post.platform];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <StatusIndicator status={post.status} />
            <span className="truncate">{post.headline ?? "Untitled post"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Thumbnail placeholder */}
          <div className="flex items-center justify-center rounded-md bg-muted/30 border h-32">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            {showBrand && post.brand && (
              <div className="flex items-center gap-1.5">
                <BrandDot post={post} />
                <span className="font-medium">{post.brand.name}</span>
              </div>
            )}
            {platformCfg && (
              <span className={cn(
                "inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-semibold",
                platformCfg.className,
              )}>
                {platformCfg.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {POST_TYPE_LABELS[post.post_type] ?? post.post_type}
            </span>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-sm">
            {post.status === "posted" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-muted-foreground">Posted:</span>
                <span>{dateStr ? formatDetailTime(dateStr) : "—"}</span>
              </>
            ) : (
              <>
                <CalendarClock className="h-4 w-4 text-amber-600" />
                <span className="text-muted-foreground">Scheduled:</span>
                <span>{dateStr ? formatDetailTime(dateStr) : "—"}</span>
              </>
            )}
          </div>

          {/* Caption */}
          {post.caption && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Caption</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.caption}</p>
            </div>
          )}

          {/* CTA */}
          {post.cta && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">CTA</div>
              <p className="text-sm">{post.cta}</p>
            </div>
          )}

          {/* Banner text */}
          {post.banner_text && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Banner Text</div>
              <p className="text-sm">{post.banner_text}</p>
            </div>
          )}

          {/* View full detail */}
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onClose();
                router.push(`/queue/${post.id}`);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open full detail
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card Component ───────────────────────────────────────────────────────────

interface CalendarPostCardProps {
  post: Post;
  variant: "detailed" | "compact";
  showBrand: boolean;
}

export function CalendarPostCard({ post, variant, showBrand }: CalendarPostCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const dateStr = getPostDate(post);
  const timeLabel = dateStr ? formatCardTime(dateStr) : "";
  const styles = getStatusStyle(post.status);

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => setDialogOpen(true)}
          className={cn(
            "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-colors border-l-2",
            styles.border,
            styles.compactBg,
            styles.compactHover,
          )}
        >
          {showBrand && <BrandDot post={post} />}
          <span className="shrink-0 text-muted-foreground">{timeLabel}</span>
          <PlatformTag platform={post.platform} />
          <span className="truncate">{post.headline ?? post.caption ?? "Untitled"}</span>
        </button>
        <PostDetailDialog post={post} open={dialogOpen} onClose={() => setDialogOpen(false)} showBrand={showBrand} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className={cn(
          "w-full rounded-md border border-l-[3px] p-2 text-left text-xs transition-colors cursor-pointer",
          styles.border,
          styles.bg,
          styles.hoverBg,
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-muted-foreground">{timeLabel}</span>
          <div className="flex items-center gap-1">
            <PlatformTag platform={post.platform} />
            <StatusIndicator status={post.status} />
          </div>
        </div>
        {showBrand && post.brand && (
          <div className="mt-1 flex items-center gap-1 min-w-0">
            <BrandDot post={post} />
            <span className="truncate text-muted-foreground">{post.brand.name}</span>
          </div>
        )}
        <div className="mt-1 line-clamp-2 text-foreground">
          {post.headline ?? post.caption ?? "Untitled post"}
        </div>
      </button>
      <PostDetailDialog post={post} open={dialogOpen} onClose={() => setDialogOpen(false)} showBrand={showBrand} />
    </>
  );
}
