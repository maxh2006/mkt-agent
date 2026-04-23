import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, Errors, sessionUser } from "@/lib/api";
import { fetchPromotionsForBrand } from "@/lib/promotions/adapter";

/**
 * POST /api/promotions/fetch-preview
 *
 * Admin-only dev endpoint for inspecting what the Running Promotions
 * live adapter returns for a given brand. Useful for:
 *   - verifying integration config against a real upstream
 *   - sanity-checking the shape of `skipped[]` when upstream drifts
 *
 * Gated two ways (same pattern as /api/ai/generate-from-fixture):
 *   1. `ALLOW_ADMIN_PROMO_PREVIEW=true` env flag — keeps prod quiet unless
 *      explicitly enabled
 *   2. Admin role
 *
 * Body:
 *   { brand_id: string }
 *
 * Returns the raw `PromoAdapterResult` (brand_id, endpoint_used,
 * fetched_at, promos[], skipped[], error?) — same object that future
 * schedulers / generation callers will consume.
 */

const BodySchema = z.object({
  brand_id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (process.env.ALLOW_ADMIN_PROMO_PREVIEW !== "true") {
    return Errors.VALIDATION(
      "Promotion preview disabled. Set ALLOW_ADMIN_PROMO_PREVIEW=true to enable.",
    );
  }

  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(
      parsed.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const result = await fetchPromotionsForBrand(parsed.data.brand_id);
  return ok(result);
}
