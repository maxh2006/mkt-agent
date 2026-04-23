import { db } from "@/lib/db";
import { dispatchToManus } from "./client";
import { buildPublishPayload } from "./platform-payload";
import type { DispatcherSummary, ManusDispatchPayload } from "./types";

/**
 * Manus dispatcher — the worker-side entry point.
 *
 * Picks due PostPlatformDelivery rows (status=queued, scheduled_for <= now()),
 * atomically claims them (SELECT FOR UPDATE SKIP LOCKED + UPDATE … RETURNING so
 * concurrent dispatchers don't double-send), builds the payload from the approved
 * parent Post, and hands off to the Manus client. Does NOT wait for Manus results
 * — those arrive asynchronously via a future callback route (out of scope here).
 *
 * Safe to invoke from:
 *  - a cron/timer (Vercel Cron, GCP Scheduler, or a plain crontab hitting
 *    POST /api/jobs/dispatch)
 *  - a one-off manual trigger
 *  - a test
 *
 * Returns a summary for logging / observability.
 */

interface ClaimedRow {
  id: string;
  post_id: string;
  platform: "instagram" | "facebook" | "twitter" | "tiktok" | "telegram";
  scheduled_for: Date | null;
  retry_count: number;
}

const DEFAULT_BATCH = 25;

export async function runManusDispatcher(options: { batchSize?: number } = {}): Promise<DispatcherSummary> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH;

  // ─── 1. Claim due deliveries atomically.
  // One SQL statement: lock queued/scheduled rows whose scheduled_for has arrived,
  // mark them publishing, return the claimed set. Uses FOR UPDATE SKIP LOCKED so
  // two dispatchers running concurrently never pick the same row.
  // Both `queued` (immediate) and `scheduled` (future) rows are eligible once
  // scheduled_for passes — `scheduled` transitions directly to `publishing`.
  const claimed = await db.$queryRaw<ClaimedRow[]>`
    UPDATE "post_platform_deliveries"
    SET "status" = 'publishing',
        "publish_requested_at" = now(),
        "updated_at" = now()
    WHERE "id" IN (
      SELECT "id" FROM "post_platform_deliveries"
      WHERE "status" IN ('queued', 'scheduled') AND "scheduled_for" <= now()
      ORDER BY "scheduled_for" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "post_id", "platform", "scheduled_for", "retry_count"
  `;

  console.log(`[manus-dispatcher] claimed=${claimed.length} batch=${batchSize}`);

  const summary: DispatcherSummary = {
    picked: claimed.length,
    claimed: claimed.length,
    dispatched: 0,
    errors: [],
    dry_run: !process.env.MANUS_AGENT_ENDPOINT,
  };

  if (claimed.length === 0) return summary;

  // ─── 2. Load the parent posts in one query to avoid N+1.
  const postIds = [...new Set(claimed.map((c) => c.post_id))];
  const posts = await db.post.findMany({
    where: { id: { in: postIds } },
    include: { brand: { select: { id: true, name: true } } },
  });
  const postMap = new Map(posts.map((p) => [p.id, p]));

  // ─── 3. For each claimed row, build the payload and hand off.
  for (const row of claimed) {
    const post = postMap.get(row.post_id);
    if (!post) {
      summary.errors.push({
        delivery_id: row.id,
        platform: row.platform,
        error: "Parent post not found",
      });
      continue;
    }

    const content = {
      headline: post.headline,
      caption: post.caption,
      cta: post.cta,
      banner_text: post.banner_text,
      image_prompt: post.image_prompt,
    };

    // Shape the platform-specific publish payload. Pure function; emits
    // one [manus-payload] log line per dispatch showing present/omitted
    // slots (no content values). Does not mutate `content`.
    const publish_payload = buildPublishPayload(row.platform, content, {
      delivery_id: row.id,
    });

    const payload: ManusDispatchPayload = {
      post_id: post.id,
      delivery_id: row.id,
      platform: row.platform,
      brand: {
        id: post.brand.id,
        name: post.brand.name,
      },
      content,
      publish_payload,
      scheduled_for: row.scheduled_for ? row.scheduled_for.toISOString() : null,
      source: {
        post_type: post.post_type,
        source_type: post.source_type ?? null,
        source_id: post.source_id ?? null,
        source_instance_key: post.source_instance_key ?? null,
      },
      retry_count: row.retry_count,
    };

    const result = await dispatchToManus(payload);
    if (result.accepted) {
      summary.dispatched += 1;
      const refSuffix = result.external_ref ? ` external_ref=${result.external_ref}` : "";
      console.log(
        `[manus-dispatcher] dispatched delivery=${row.id} platform=${row.platform} post=${post.id}${refSuffix}${result.dry_run ? " (dry-run)" : ""}`,
      );
    } else {
      summary.errors.push({
        delivery_id: row.id,
        platform: row.platform,
        error: result.error ?? "Unknown handoff failure",
      });
      const codeSuffix = result.error_code ? ` code=${result.error_code}` : "";
      console.warn(
        `[manus-dispatcher] handoff FAILED delivery=${row.id} platform=${row.platform} post=${post.id}${codeSuffix} err=${result.error ?? "unknown"}`,
      );
      // The delivery is already in `publishing`. Transitioning it back to
      // `failed` on handoff error is a reconciler concern (out of scope here).
      // A subsequent tick can pick it up only after an explicit retry reset.
    }
  }

  return summary;
}
