"use client";

import { useRouter } from "next/navigation";
import type { Post } from "@/lib/posts-api";
import { formatCardTime, getPostDate } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";

const PLATFORM_STYLE: Record<string, { abbr: string; className: string }> = {
  instagram: { abbr: "IG", className: "bg-pink-500/10 text-pink-700 border-pink-500/20" },
  facebook:  { abbr: "FB", className: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  twitter:   { abbr: "TW", className: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  tiktok:    { abbr: "TK", className: "bg-slate-500/10 text-slate-700 border-slate-500/20" },
  telegram:  { abbr: "TG", className: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
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
  const color = post.brand?.primary_color ?? brandDotColor(post.brand?.name ?? "");
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    />
  );
}

interface CalendarPostCardProps {
  post: Post;
  variant: "detailed" | "compact";
  showBrand: boolean;
}

export function CalendarPostCard({ post, variant, showBrand }: CalendarPostCardProps) {
  const router = useRouter();
  const dateStr = getPostDate(post);
  const timeLabel = dateStr ? formatCardTime(dateStr) : "";

  if (variant === "compact") {
    return (
      <button
        onClick={() => router.push(`/queue/${post.id}`)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted/50 transition-colors"
      >
        {showBrand && <BrandDot post={post} />}
        <span className="shrink-0 text-muted-foreground">{timeLabel}</span>
        <PlatformTag platform={post.platform} />
        <span className="truncate">{post.headline ?? post.caption ?? "Untitled"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push(`/queue/${post.id}`)}
      className="w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground">{timeLabel}</span>
        <div className="flex items-center gap-1">
          <PlatformTag platform={post.platform} />
          <span className={cn(
            "inline-flex items-center rounded border px-1 py-0 text-[10px] font-medium leading-4",
            post.status === "approved"
              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
              : "bg-blue-500/10 text-blue-700 border-blue-500/20",
          )}>
            {post.status === "approved" ? "Posted" : "Scheduled"}
          </span>
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
  );
}
