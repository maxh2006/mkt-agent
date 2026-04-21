import type { Post } from "./posts-api";

export interface DateRange {
  start: Date;
  end: Date;
}

export function getWeekRange(anchor: Date): DateRange {
  const d = new Date(anchor);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(anchor: Date): DateRange {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const startDay = firstOfMonth.getDay();
  const startDiff = startDay === 0 ? -6 : 1 - startDay;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() + startDiff);
  start.setHours(0, 0, 0, 0);
  const endDay = lastOfMonth.getDay();
  const endDiff = endDay === 0 ? 0 : 7 - endDay;
  const end = new Date(lastOfMonth);
  end.setDate(lastOfMonth.getDate() + endDiff);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getDaysInRange(range: DateRange): Date[] {
  const days: Date[] = [];
  const current = new Date(range.start);
  while (current <= range.end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export function getPostDate(post: Post): string | null {
  // Posted posts display their real posted_at time.
  if (post.status === "posted" && post.posted_at) return post.posted_at;
  if (post.status === "posted" && !post.posted_at) return post.updated_at;
  if (post.status === "scheduled" && post.scheduled_at) return post.scheduled_at;
  return post.scheduled_at ?? post.posted_at ?? null;
}

export function toDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupPostsByDate(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const post of posts) {
    const dateStr = getPostDate(post);
    if (!dateStr) continue;
    const key = toDateKey(dateStr);
    const list = map.get(key) ?? [];
    list.push(post);
    map.set(key, list);
  }
  for (const [key, list] of map) {
    list.sort((a, b) => {
      const da = getPostDate(a) ?? "";
      const db = getPostDate(b) ?? "";
      return da.localeCompare(db);
    });
    map.set(key, list);
  }
  return map;
}

export function formatCardTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(d: Date, anchor: Date): boolean {
  return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
}

export function formatDateRangeLabel(range: DateRange, view: "week" | "month"): string {
  if (view === "month") {
    return range.start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // Week view: show month/year context only — day numbers already visible in grid.
  const startMonth = range.start.getMonth();
  const startYear = range.start.getFullYear();
  const endMonth = range.end.getMonth();
  const endYear = range.end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    // Entirely within one month
    return range.start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  if (startYear === endYear) {
    // Spans two months in the same year — e.g. "Apr – May 2026"
    const startName = range.start.toLocaleDateString("en-US", { month: "short" });
    const endName = range.end.toLocaleDateString("en-US", { month: "short" });
    return `${startName} – ${endName} ${startYear}`;
  }

  // Spans two years — e.g. "Dec 2026 – Jan 2027"
  const startName = range.start.toLocaleDateString("en-US", { month: "short" });
  const endName = range.end.toLocaleDateString("en-US", { month: "short" });
  return `${startName} ${startYear} – ${endName} ${endYear}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export { DAY_NAMES };
