import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";

/**
 * GET /api/posts/[id]/deliveries
 * Returns per-platform delivery rows for a post.
 * All roles can read (same as other post reads).
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

  const deliveries = await db.postPlatformDelivery.findMany({
    where: { post_id: id },
    orderBy: { platform: "asc" },
  });

  return ok({
    post: { id: post.id, status: post.status, scheduled_at: post.scheduled_at, platform: post.platform },
    deliveries,
  });
}
