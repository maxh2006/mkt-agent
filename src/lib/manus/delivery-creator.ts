import { db } from "@/lib/db";
import type { Platform } from "@/generated/prisma/enums";

/**
 * Creates PostPlatformDelivery rows for a post when it enters the delivery
 * lifecycle (approve / schedule). Idempotent: relies on the
 * `@@unique([post_id, platform])` constraint and Prisma's `skipDuplicates` so
 * re-calling the approve/schedule path never duplicates deliveries.
 *
 * Delivery status model:
 *   - scheduled_for > now  → status = "scheduled"  (future, not yet eligible)
 *   - scheduled_for <= now → status = "queued"     (eligible on next dispatcher pass)
 *
 * The Manus dispatcher claims `status IN ('queued','scheduled')` with
 * `scheduled_for <= now()`, so a `scheduled` row transitions directly to
 * `publishing` when its time arrives.
 *
 * Platform: currently one row per post, keyed on `post.platform`. Multi-platform
 * campaigns are modeled as multiple posts (see `events/[id]/generate-drafts`),
 * so a single delivery per post is correct for the current data model.
 */
export async function ensureDeliveriesForPost(
  post: { id: string; platform: Platform; scheduled_at: Date | null },
  now: Date = new Date(),
): Promise<{ created: number }> {
  const scheduledFor = post.scheduled_at ?? now;
  const status = scheduledFor > now ? "scheduled" : "queued";

  const result = await db.postPlatformDelivery.createMany({
    data: [
      {
        post_id: post.id,
        platform: post.platform,
        status,
        scheduled_for: scheduledFor,
        worker: "manus",
      },
    ],
    skipDuplicates: true,
  });

  return { created: result.count };
}
