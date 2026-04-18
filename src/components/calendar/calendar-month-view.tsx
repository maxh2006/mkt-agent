"use client";

import { useState } from "react";
import type { Post } from "@/lib/posts-api";
import {
  getDaysInRange,
  isToday,
  isSameMonth,
  toDateKey,
  DAY_NAMES,
  type DateRange,
} from "@/lib/calendar-utils";
import { CalendarPostCard } from "./calendar-post-card";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 3;

interface CalendarMonthViewProps {
  range: DateRange;
  anchorDate: Date;
  postsByDate: Map<string, Post[]>;
  showBrand: boolean;
}

export function CalendarMonthView({ range, anchorDate, postsByDate, showBrand }: CalendarMonthViewProps) {
  const days = getDaysInRange(range);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden min-w-[700px]">
        {DAY_NAMES.map((name) => (
          <div key={name} className="bg-muted/50 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground uppercase">
            {name}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day.toISOString());
          const posts = postsByDate.get(key) ?? [];
          const today = isToday(day);
          const inMonth = isSameMonth(day, anchorDate);
          const isExpanded = expandedDay === key;
          const visiblePosts = isExpanded ? posts : posts.slice(0, MAX_VISIBLE);
          const overflow = posts.length - MAX_VISIBLE;

          return (
            <div
              key={key}
              className={cn(
                "bg-background min-h-[120px] p-1",
                !inMonth && "bg-muted/20",
              )}
            >
              <div className={cn(
                "text-xs font-medium mb-0.5 px-1",
                !inMonth && "text-muted-foreground/50",
              )}>
                <span className={cn(
                  today && "bg-primary text-primary-foreground rounded-full inline-flex items-center justify-center w-5 h-5 text-[10px]",
                )}>
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {visiblePosts.map((post) => (
                  <CalendarPostCard
                    key={post.id}
                    post={post}
                    variant="compact"
                    showBrand={showBrand}
                  />
                ))}
                {overflow > 0 && !isExpanded && (
                  <button
                    onClick={() => setExpandedDay(key)}
                    className="text-[11px] text-primary hover:underline px-1"
                  >
                    +{overflow} more
                  </button>
                )}
                {isExpanded && overflow > 0 && (
                  <button
                    onClick={() => setExpandedDay(null)}
                    className="text-[11px] text-muted-foreground hover:underline px-1"
                  >
                    show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
