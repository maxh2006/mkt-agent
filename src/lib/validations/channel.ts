import { z } from "zod";

// Platform values mirror the Prisma Platform enum exactly.
export const PLATFORMS = [
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
  "telegram",
] as const;

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter / X",
  tiktok: "TikTok",
  telegram: "Telegram",
};

// ChannelStatus mirrors the Prisma ChannelStatus enum exactly.
export const CHANNEL_STATUSES = [
  "active",
  "disconnected",
  "error",
  "disabled",
] as const;

export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const CHANNEL_STATUS_LABELS: Record<ChannelStatus, string> = {
  active: "Active",
  disconnected: "Disconnected",
  error: "Error",
  disabled: "Disabled",
};

export const createChannelSchema = z.object({
  platform: z.enum(PLATFORMS, { message: "Invalid platform" }),
  account_name: z.string().min(1, "Account name is required").max(255),
  status: z.enum(CHANNEL_STATUSES).optional(),
  // notes is a lightweight free-text config field for MVP operator notes
  notes: z.string().max(500).optional(),
});

export const updateChannelSchema = z.object({
  account_name: z.string().min(1, "Account name is required").max(255).optional(),
  status: z.enum(CHANNEL_STATUSES).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
