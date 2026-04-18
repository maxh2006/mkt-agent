export interface PostingInstanceConfig {
  frequency: "daily" | "weekly" | "monthly";
  time: string; // HH:mm (24h)
  weekdays?: number[]; // 1=Mon...7=Sun
  month_days?: number[]; // 1-31
}

const WEEKDAY_ABBRS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  if (h === 0) return `12:${m} AM`;
  if (h < 12) return `${h}:${m} AM`;
  if (h === 12) return `12:${m} PM`;
  return `${h - 12}:${m} PM`;
}

export function formatPostingInstance(config: PostingInstanceConfig): string {
  const time = formatTime12h(config.time);
  if (config.frequency === "daily") return `Daily at ${time}`;
  if (config.frequency === "weekly") {
    const days = (config.weekdays ?? []).sort((a, b) => a - b).map((d) => WEEKDAY_ABBRS[d]).join("/");
    return `Weekly · ${days} at ${time}`;
  }
  const days = (config.month_days ?? []).sort((a, b) => a - b).join(", ");
  return `Monthly · ${days} at ${time}`;
}

export function formatPostingInstanceCompact(config: PostingInstanceConfig): string {
  const time = formatTime12h(config.time);
  if (config.frequency === "daily") return `Daily · ${time}`;
  if (config.frequency === "weekly") {
    const days = (config.weekdays ?? []).sort((a, b) => a - b).map((d) => WEEKDAY_ABBRS[d]).join("/");
    return `Weekly · ${days} · ${time}`;
  }
  const days = (config.month_days ?? []).sort((a, b) => a - b).join(",");
  return `Monthly · ${days} · ${time}`;
}

export function formatPostingInstanceWithEnd(
  config: PostingInstanceConfig,
  endAt: Date | string | null,
): string {
  const base = formatPostingInstance(config);
  if (!endAt) return base;
  const d = typeof endAt === "string" ? new Date(endAt) : endAt;
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${base} until ${label}`;
}

export function parsePostingInstance(json: unknown): PostingInstanceConfig | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const freq = obj.frequency;
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly") return null;
  const time = typeof obj.time === "string" ? obj.time : null;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const config: PostingInstanceConfig = { frequency: freq, time };
  if (freq === "weekly" && Array.isArray(obj.weekdays)) {
    config.weekdays = obj.weekdays.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7);
    if (config.weekdays.length === 0) return null;
  }
  if (freq === "monthly" && Array.isArray(obj.month_days)) {
    config.month_days = obj.month_days.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 31);
    if (config.month_days.length === 0) return null;
  }
  return config;
}

function clampDayToMonth(day: number, year: number, month: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

export function generateOccurrences(
  config: PostingInstanceConfig,
  startAt: Date,
  endAt: Date,
): Date[] {
  const [hStr, mStr] = config.time.split(":");
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  const occurrences: Date[] = [];
  const now = new Date();

  if (config.frequency === "daily") {
    const cursor = new Date(startAt);
    cursor.setHours(hours, minutes, 0, 0);
    if (cursor < startAt) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= endAt) {
      if (cursor >= now) occurrences.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (config.frequency === "weekly") {
    const targetDays = new Set(config.weekdays ?? []);
    const cursor = new Date(startAt);
    cursor.setHours(hours, minutes, 0, 0);
    if (cursor < startAt) cursor.setDate(cursor.getDate() + 1);
    while (cursor <= endAt) {
      let jsDay = cursor.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      if (targetDays.has(isoDay) && cursor >= now) {
        occurrences.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const targetDays = config.month_days ?? [];
    const cursor = new Date(startAt.getFullYear(), startAt.getMonth(), 1, hours, minutes, 0);
    while (cursor <= endAt) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      for (const day of targetDays) {
        const clamped = clampDayToMonth(day, year, month);
        const d = new Date(year, month, clamped, hours, minutes, 0);
        if (d >= startAt && d <= endAt && d >= now) {
          occurrences.push(d);
        }
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    occurrences.sort((a, b) => a.getTime() - b.getTime());
  }
  return occurrences;
}
