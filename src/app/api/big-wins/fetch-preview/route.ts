import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, Errors, sessionUser } from "@/lib/api";
import { fetchBigWinsForBrand } from "@/lib/big-wins/adapter";

/**
 * POST /api/big-wins/fetch-preview
 *
 * Admin-only dev endpoint for inspecting the Big Wins live adapter
 * output for a given brand. Useful for:
 *   - sanity-checking the SQL + join shape against real brand data
 *   - verifying the missing-table degradation path before shared.game_rounds lands
 *   - confirming maskUsername() is applied to every fact
 *
 * Gated two ways (same pattern as /api/ai/generate-from-fixture +
 * /api/promotions/fetch-preview):
 *   1. `ALLOW_ADMIN_BQ_PREVIEW=true` env flag — keeps prod quiet
 *   2. Admin role
 *
 * Body:
 *   {
 *     brand_id:       string,
 *     min_payout?:    number (default 500),
 *     min_multiplier?: number (default 10),
 *     logic?:         "AND" | "OR" (default "OR"),
 *     since_iso?:     string (default now - 24h),
 *     limit?:         number (default 50),
 *     currency?:      string (default "PHP")
 *   }
 *
 * Defaults mirror docs/04-automations.md Tab 1 default_rule config.
 * Returns the raw `BigWinAdapterResult`.
 */

const BodySchema = z.object({
  brand_id: z.string().min(1),
  min_payout: z.number().int().nonnegative().optional(),
  min_multiplier: z.number().int().nonnegative().optional(),
  logic: z.enum(["AND", "OR"]).optional(),
  since_iso: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
  currency: z.string().length(3).optional(),
});

export async function POST(req: NextRequest) {
  if (process.env.ALLOW_ADMIN_BQ_PREVIEW !== "true") {
    return Errors.VALIDATION(
      "BQ preview disabled. Set ALLOW_ADMIN_BQ_PREVIEW=true to enable.",
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

  const nowMs = Date.now();
  const defaultSince = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const result = await fetchBigWinsForBrand({
    brand_id: parsed.data.brand_id,
    min_payout: parsed.data.min_payout ?? 500,
    min_multiplier: parsed.data.min_multiplier ?? 10,
    logic: parsed.data.logic ?? "OR",
    since_iso: parsed.data.since_iso ?? defaultSince,
    limit: parsed.data.limit,
    currency: parsed.data.currency,
  });

  return ok(result);
}
