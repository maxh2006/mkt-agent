import { db } from "@/lib/db";
import {
  computePostStatusFromDeliveries,
  type AggregatedPostStatus,
} from "@/lib/delivery-aggregation";
import { isValidTransition } from "@/lib/post-status";

/**
 * Recomputes the parent Post.status from its PostPlatformDelivery rows and
 * updates the Post when the computed status differs from the current one.
 *
 * Call this after any authoritative change to a delivery (e.g. Manus callback
 * applied). Manus is authoritative on actual platform outcomes, so if the
 * computed transition isn't in VALID_TRANSITIONS we log a warning but still
 * apply the update — the delivery rows are source of truth.
 *
 * Side effects:
 * - Sets Post.posted_at (to the latest delivery.posted_at across all posted
 *   deliveries) when the Post transitions to `posted` and posted_at was null.
 *
 * Returns the computed status, or null when there are no deliveries yet
 * or the post can't be found.
 */
export async function reconcilePostStatus(
  postId: string,
): Promise<AggregatedPostStatus | null> {
  const deliveries = await db.postPlatformDelivery.findMany({
    where: { post_id: postId },
    select: { status: true, posted_at: true },
  });

  const computed = computePostStatusFromDeliveries(deliveries);
  if (!computed) return null;

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { status: true, posted_at: true },
  });
  if (!post) return null;

  if (post.status === computed) return computed;

  if (!isValidTransition(post.status, computed)) {
    console.warn(
      `[manus-reconcile] applying non-standard transition ${post.status} → ${computed} post=${postId} (delivery outcomes are authoritative)`,
    );
  }

  const data: { status: AggregatedPostStatus; posted_at?: Date } = {
    status: computed,
  };

  if (computed === "posted" && !post.posted_at) {
    const postedTimes = deliveries
      .filter((d) => d.status === "posted" && d.posted_at)
      .map((d) => (d.posted_at as Date).getTime());
    if (postedTimes.length > 0) {
      data.posted_at = new Date(Math.max(...postedTimes));
    }
  }

  await db.post.update({ where: { id: postId }, data });
  return computed;
}
