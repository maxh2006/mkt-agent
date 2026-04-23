import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";
import { classifyFailure } from "@/lib/manus/retryability";

/**
 * GET /api/posts/[id]/deliveries
 * Returns per-platform delivery rows for a post.
 * All roles can read (same as other post reads).
 *
 * Each delivery is enriched with a `failure_class` derived from
 * `last_error`. `failure_class` is null for non-failed rows; for
 * failed rows it carries `retryable`, `code`, `label`, `hint`, and
 * `source` (see `src/lib/manus/retryability.ts`). Letting the server
 * classify keeps the UI simple and the classification rules in one
 * place — shared with the retry route.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);

  const { id } = await params;
  const post = await db.post.findFirst({
    where: { id, brand_id: { in: ctx.brandIds } },
    select: { id: true, status: true, scheduled_at: true, platform: true },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  const rows = await db.postPlatformDelivery.findMany({
    where: { post_id: id },
    orderBy: { platform: "asc" },
  });

  const deliveries = rows.map((d) => ({
    ...d,
    failure_class:
      d.status === "failed" ? classifyFailure(d.last_error) : null,
  }));

  return ok({
    post: { id: post.id, status: post.status, scheduled_at: post.scheduled_at, platform: post.platform },
    deliveries,
  });
}
