import type { PlatformDelivery } from "@/lib/posts-api";

/**
 * Aggregation rules from per-platform deliveries to post-level status.
 * Used for visibility and (later) by a backend reconciler.
 *
 * Rules:
 * - any delivery still publishing → post is `publishing`
 * - any delivery still queued/scheduled → post is `scheduled`
 * - all delivered `posted` → `posted`
 * - all delivered `failed` → `failed`
 * - mix of posted + failed (no in-flight) → `partial`
 */
export type AggregatedPostStatus =
  | "scheduled"
  | "publishing"
  | "posted"
  | "partial"
  | "failed";

export function computePostStatusFromDeliveries(
  deliveries: PlatformDelivery[],
): AggregatedPostStatus | null {
  if (deliveries.length === 0) return null;

  if (deliveries.some((d) => d.status === "publishing")) return "publishing";
  if (deliveries.some((d) => d.status === "queued" || d.status === "scheduled")) return "scheduled";

  const postedCount = deliveries.filter((d) => d.status === "posted").length;
  const failedCount = deliveries.filter((d) => d.status === "failed").length;

  if (postedCount === deliveries.length) return "posted";
  if (failedCount === deliveries.length) return "failed";
  if (postedCount > 0 && failedCount > 0) return "partial";

  return null;
}
