"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { postsApi } from "@/lib/posts-api";
import { useActiveBrand } from "@/lib/active-brand-client";
import {
  getWeekRange,
  getMonthRange,
  groupPostsByDate,
  formatDateRangeLabel,
} from "@/lib/calendar-utils";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "twitter", label: "Twitter/X" },
  { value: "tiktok", label: "TikTok" },
  { value: "telegram", label: "Telegram" },
];

const POST_TYPES = [
  { value: "all", label: "All Types" },
  { value: "promo", label: "Running Promotion" },
  { value: "big_win", label: "Big Win" },
  { value: "event", label: "Adhoc Event" },
  { value: "educational", label: "Educational" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved (Posted)" },
  { value: "scheduled", label: "Scheduled" },
];

type CalendarView = "week" | "month";

interface CalendarFilters {
  platform: string;
  post_type: string;
  status: string;
}

export default function CalendarPage() {
  const { isAllBrands, isLoading: brandLoading } = useActiveBrand();
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [filters, setFilters] = useState<CalendarFilters>({
    platform: "all",
    post_type: "all",
    status: "all",
  });

  const range = useMemo(
    () => (view === "week" ? getWeekRange(anchorDate) : getMonthRange(anchorDate)),
    [view, anchorDate],
  );

  const queryFilters = useMemo(() => ({
    statuses: filters.status !== "all" ? filters.status : "approved,scheduled",
    platform: filters.platform !== "all" ? filters.platform : undefined,
    post_type: filters.post_type !== "all" ? filters.post_type : undefined,
    date_from: range.start.toISOString(),
    date_to: range.end.toISOString(),
    per_page: 200,
  }), [filters, range]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["calendar-posts", queryFilters],
    queryFn: () => postsApi.list(queryFilters),
    staleTime: 30_000,
  });

  const postsByDate = useMemo(
    () => groupPostsByDate(data?.posts ?? []),
    [data?.posts],
  );

  function navigate(direction: -1 | 1) {
    setAnchorDate((prev) => {
      const next = new Date(prev);
      if (view === "week") next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  function goToday() {
    setAnchorDate(new Date());
  }

  function updateFilter(key: keyof CalendarFilters, value: string | null) {
    setFilters((prev) => ({ ...prev, [key]: value ?? "all" }));
  }

  const rangeLabel = formatDateRangeLabel(range, view);
  const totalPosts = data?.posts.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual planner for approved and scheduled posts.
        </p>
      </div>

      {/* Controls bar — 3-slot layout: controls | centered label | post count */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
        {/* Left: controls cluster */}
        <div className="flex flex-wrap items-center gap-2 md:justify-self-start">
          {/* View toggle */}
          <div className="inline-flex rounded-md border">
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-colors ${
                view === "week"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md border-l transition-colors ${
                view === "month"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Month
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Center: period label */}
        <h2 className="text-lg font-semibold md:justify-self-center">{rangeLabel}</h2>

        {/* Right: post count */}
        <div className="flex items-center md:justify-self-end">
          <span className="text-xs text-muted-foreground">{totalPosts} post{totalPosts !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.platform} onValueChange={(v) => updateFilter("platform", v)}>
          <SelectTrigger className="h-8 w-[150px] text-sm">
            {filters.platform === "all"
              ? <span className="text-muted-foreground">Platform</span>
              : <SelectValue />}
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.post_type} onValueChange={(v) => updateFilter("post_type", v)}>
          <SelectTrigger className="h-8 w-[170px] text-sm">
            {filters.post_type === "all"
              ? <span className="text-muted-foreground">Type</span>
              : <SelectValue />}
          </SelectTrigger>
          <SelectContent>
            {POST_TYPES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
          <SelectTrigger className="h-8 w-[170px] text-sm">
            {filters.status === "all"
              ? <span className="text-muted-foreground">Status</span>
              : <SelectValue />}
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {brandLoading || isLoading ? (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">Loading calendar…</p>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-6 text-center">
          <p className="text-sm text-destructive">Failed to load calendar data.</p>
        </div>
      ) : view === "week" ? (
        <CalendarWeekView range={range} postsByDate={postsByDate} showBrand={isAllBrands} />
      ) : (
        <CalendarMonthView range={range} anchorDate={anchorDate} postsByDate={postsByDate} showBrand={isAllBrands} />
      )}
    </div>
  );
}
