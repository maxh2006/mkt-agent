import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";
import { resolveEventBriefContext } from "@/lib/event-brief-context";

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
    select: { source_type: true, source_id: true, source_instance_key: true },
  });
  if (!post) return Errors.NOT_FOUND("Post");

  const context = await resolveEventBriefContext(
    post.source_type,
    post.source_id,
    post.source_instance_key,
  );

  return ok(context);
}
