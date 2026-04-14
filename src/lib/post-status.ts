import type { PostStatus } from "@/generated/prisma/enums";

/**
 * Defines which transitions are allowed for each post status.
 * Any transition not listed here must be rejected.
 */
const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["scheduled", "posted"],
  scheduled: ["posted", "failed"],
  posted: [],
  rejected: [],
  failed: [],
};

export function isValidTransition(from: PostStatus, to: PostStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Returns the list of reachable next statuses from the given status.
 * Useful for building UI controls.
 */
export function nextStatuses(from: PostStatus): PostStatus[] {
  return VALID_TRANSITIONS[from] ?? [];
}
