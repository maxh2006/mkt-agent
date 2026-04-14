import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";
import { z } from "zod";

const querySchema = z.object({
  action: z.string().max(100).optional(),
  entity_type: z.string().max(100).optional(),
  // ISO date strings — filter to entries created on/after and before
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => Math.max(1, parseInt(v ?? "1", 10) || 1)),
  per_page: z
    .string()
    .optional()
    .transform((v) => Math.min(100, Math.max(1, parseInt(v ?? "50", 10) || 50))),
});

/**
 * GET /api/audit-logs
 * Returns paginated audit log entries for the active brand.
 * All roles can read logs for their accessible brands.
 *
 * ?action=post.approved
 * ?entity_type=post
 * ?date_from=2026-04-01   (ISO date, inclusive)
 * ?date_to=2026-04-30     (ISO date, inclusive end-of-day)
 * ?page=1&per_page=50
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx) return Errors.NO_ACTIVE_BRAND();

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Invalid query");
  }

  const { action, entity_type, date_from, date_to, page, per_page } = parsed.data;

  // Parse date filters — date_from is start of day, date_to is end of day (UTC)
  let createdAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (date_from || date_to) {
    createdAtFilter = {};
    if (date_from) {
      const d = new Date(date_from);
      if (!isNaN(d.getTime())) createdAtFilter.gte = d;
    }
    if (date_to) {
      const d = new Date(date_to);
      if (!isNaN(d.getTime())) {
        // Extend to end of the given day
        d.setUTCHours(23, 59, 59, 999);
        createdAtFilter.lte = d;
      }
    }
  }

  const where = {
    brand_id: ctx.brand.id,
    ...(action ? { action } : {}),
    ...(entity_type ? { entity_type } : {}),
    ...(createdAtFilter ? { created_at: createdAtFilter } : {}),
  };

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * per_page,
      take: per_page,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  return ok({ entries, total, page, per_page });
}
