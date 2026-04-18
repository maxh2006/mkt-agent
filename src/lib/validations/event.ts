import { z } from "zod";

// event_type is a free string in the DB — define the standard options here.
// Using string rather than an enum so operators can extend later without a migration.
export const EVENT_TYPES = [
  "top_fans",
  "seasonal",
  "loyalty",
  "deposit_boost",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<string, string> = {
  top_fans: "Top Fans",
  seasonal: "Seasonal",
  loyalty: "Loyalty",
  deposit_boost: "Deposit Boost",
  other: "Other",
};

// EventStatus mirrors the Prisma enum (draft removed)
export const EVENT_STATUSES = ["active", "ended", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

const platformValues = ["instagram", "facebook", "twitter", "tiktok", "telegram"] as const;

export const postingInstanceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:mm format"),
    weekdays: z.array(z.number().int().min(1).max(7)).optional(),
    month_days: z.array(z.number().int().min(1).max(31)).optional(),
  })
  .refine(
    (d) => {
      if (d.frequency === "weekly" && (!d.weekdays || d.weekdays.length === 0)) return false;
      if (d.frequency === "monthly" && (!d.month_days || d.month_days.length === 0)) return false;
      return true;
    },
    { message: "Weekly requires weekdays, monthly requires month_days" },
  );

export const createEventSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(255),
    event_type: z.enum(EVENT_TYPES, { message: "Invalid event type" }),
    objective: z.string().max(1000).optional(),
    rules: z.string().max(2000).optional(),
    reward: z.string().max(500).optional(),
    start_at: z.string().datetime({ message: "start_at must be an ISO 8601 datetime" }).optional(),
    end_at: z.string().datetime({ message: "end_at must be an ISO 8601 datetime" }).optional(),
    theme: z.string().max(255).optional(),
    target_audience: z.string().max(500).optional(),
    cta: z.string().max(200).optional(),
    tone: z.string().max(200).optional(),
    platform_scope: z.array(z.enum(platformValues)).optional(),
    notes_for_ai: z.string().max(2000).optional(),
    posting_instance_json: postingInstanceSchema.optional(),
    auto_generate_posts: z.boolean().optional(),
  })
  .refine(
    (d) => !(d.start_at && d.end_at && new Date(d.end_at) <= new Date(d.start_at)),
    { message: "end_at must be after start_at", path: ["end_at"] },
  );

export const updateEventSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(255).optional(),
    event_type: z.enum(EVENT_TYPES, { message: "Invalid event type" }).optional(),
    objective: z.string().max(1000).optional(),
    rules: z.string().max(2000).optional(),
    reward: z.string().max(500).optional(),
    start_at: z.string().datetime({ message: "start_at must be an ISO 8601 datetime" }).optional(),
    end_at: z.string().datetime({ message: "end_at must be an ISO 8601 datetime" }).optional(),
    theme: z.string().max(255).optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    target_audience: z.string().max(500).optional(),
    cta: z.string().max(200).optional(),
    tone: z.string().max(200).optional(),
    platform_scope: z.array(z.enum(platformValues)).optional(),
    notes_for_ai: z.string().max(2000).optional(),
    posting_instance_json: postingInstanceSchema.optional(),
    auto_generate_posts: z.boolean().optional(),
  })
  .refine(
    (d) => !(d.start_at && d.end_at && new Date(d.end_at) <= new Date(d.start_at)),
    { message: "end_at must be after start_at", path: ["end_at"] },
  );

export const listEventsQuerySchema = z.object({
  status: z.enum(EVENT_STATUSES).optional(),
  event_type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
