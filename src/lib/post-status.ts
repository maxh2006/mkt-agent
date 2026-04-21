import type { PostStatus } from "@/generated/prisma/enums";

/**
 * Defines which transitions are allowed for each post status.
 * Any transition not listed here must be rejected.
 */
// Lifecycle (target, Manus publishing plan):
//   draft → pending_approval → scheduled → publishing → posted|partial|failed
//   also: pending_approval → rejected (terminal)
// Approval is an event that records approved_at/approved_by metadata AND transitions
// the post straight to `scheduled` — there is no long-lived `approved` state anymore.
// `approved` stays in the enum for historical records only (legacy migration path).
const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["scheduled", "rejected"],
  approved: ["scheduled", "publishing", "posted", "failed"], // legacy; direct transition still allowed
  scheduled: ["publishing", "posted", "failed"],
  publishing: ["posted", "partial", "failed"],
  posted: [],
  partial: ["publishing"], // retry flow re-enters publishing for failed platforms
  rejected: [],
  failed: ["publishing"],  // retry path
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
