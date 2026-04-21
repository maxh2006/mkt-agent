"use client";

import type { Post } from "@/lib/posts-api";
import { getDaysInRange, isToday, toDateKey, DAY_NAMES, type DateRange } from "@/lib/calendar-utils";
import { CalendarPostCard } from "./calendar-post-card";
import { cn } from "@/lib/utils";

interface CalendarWeekViewProps {
  range: DateRange;
  postsByDate: Map<string, Post[]>;
  showBrand: boolean;
}

export function CalendarWeekView({ range, postsByDate, showBrand }: CalendarWeekViewProps) {
  const days = getDaysInRange(range);

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden min-w-[900px]">
        {days.map((day, i) => {
          const key = toDateKey(day.toISOString());
          const posts = postsByDate.get(key) ?? [];
          const today = isToday(day);

          return (
            <div key={key} className="bg-background flex flex-col min-h-[500px]">
              <div className={cn(
                "px-2 py-2 text-center border-b",
                today && "bg-primary/5",
              )}>
                <div className="text-[11px] font-medium text-muted-foreground uppercase">
                  {DAY_NAMES[i]}
                </div>
                <div className="mt-0.5 flex justify-center">
                  <span className={cn(
                    "inline-flex items-center justify-center w-8 h-8 text-lg font-medium rounded-full",
                    today && "bg-primary text-primary-foreground",
                  )}>
                    {day.getDate()}
                  </span>
                </div>
              </div>
              <div className="flex-1 p-1 space-y-1 overflow-y-auto">
                {posts.map((post) => (
                  <CalendarPostCard
                    key={post.id}
                    post={post}
                    variant="detailed"
                    showBrand={showBrand}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
