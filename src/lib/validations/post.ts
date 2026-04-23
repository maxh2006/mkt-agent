import { z } from "zod";

// Inline enum values to avoid importing Prisma enums in shared validation files
const postTypeValues = ["promo", "big_win", "event", "educational", "hot_games"] as const;
const platformValues = ["instagram", "facebook", "twitter", "tiktok", "telegram"] as const;
const sourceTypeValues = ["promo", "big_win", "event", "manual", "hot_games"] as const;

// `image_url` — public media reference published by Manus.
// Follows the existing "empty string == no change" save convention:
// whitespace-only / empty inputs are preprocessed to `undefined` so a
// blank form save doesn't overwrite a stored URL. Non-empty values
// must be well-formed URLs under 2048 chars. The http/https scheme
// constraint + reachability check live in
// `src/lib/manus/media-validation.ts` (pre-dispatch) — we don't
// duplicate that here, keeping this layer a syntactic sanity check.
const optionalImageUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .max(2048, "image_url is too long")
    .url("image_url must be a valid URL")
    .optional(),
);

export const createPostSchema = z.object({
  post_type: z.enum(postTypeValues),
  platform: z.enum(platformValues),
  headline: z.string().max(300).optional(),
  caption: z.string().max(2200).optional(),
  cta: z.string().max(200).optional(),
  banner_text: z.string().max(200).optional(),
  image_prompt: z.string().max(1000).optional(),
  image_url: optionalImageUrl,
  source_type: z.enum(sourceTypeValues).optional(),
  source_id: z.string().optional(),
  source_instance_key: z.string().optional(),
});

export const updatePostSchema = z.object({
  headline: z.string().max(300).optional(),
  caption: z.string().max(2200).optional(),
  cta: z.string().max(200).optional(),
  banner_text: z.string().max(200).optional(),
  image_prompt: z.string().max(1000).optional(),
  image_url: optionalImageUrl,
  source_type: z.enum(sourceTypeValues).optional(),
  source_id: z.string().optional(),
});

export const schedulePostSchema = z.object({
  scheduled_at: z.string().datetime({ message: "scheduled_at must be an ISO 8601 datetime" }),
});

const postStatusValues = ["draft", "pending_approval", "approved", "scheduled", "publishing", "posted", "partial", "rejected", "failed"] as const;

export const listPostsQuerySchema = z.object({
  status: z.enum(postStatusValues).optional(),
  statuses: z.string().optional(),
  platform: z.enum(platformValues).optional(),
  post_type: z.enum(postTypeValues).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(200).default(25),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type SchedulePostInput = z.infer<typeof schedulePostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
