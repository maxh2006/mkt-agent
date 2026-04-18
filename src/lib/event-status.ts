export const ARCHIVE_THRESHOLD_DAYS = 14;

type EventStatusValue = "active" | "ended" | "archived";

export function normalizeEventStatus(
  stored: string,
  endAt: Date | string | null,
  now: Date = new Date(),
): EventStatusValue {
  if (stored === "archived") return "archived";
  if (!endAt) return stored as EventStatusValue;

  const endDate = typeof endAt === "string" ? new Date(endAt) : endAt;
  if (endDate >= now) return stored as EventStatusValue;

  const daysPast = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysPast >= ARCHIVE_THRESHOLD_DAYS) return "archived";
  return "ended";
}

export function normalizeEvent<T extends { status: string; end_at: Date | string | null }>(
  event: T,
  now?: Date,
): T {
  return { ...event, status: normalizeEventStatus(event.status, event.end_at, now) };
}

export function normalizeEvents<T extends { status: string; end_at: Date | string | null }>(
  events: T[],
  now?: Date,
): T[] {
  return events.map((e) => normalizeEvent(e, now));
}
