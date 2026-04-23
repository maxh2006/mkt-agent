import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, Errors, sessionUser } from "@/lib/api";
import { fetchHotGamesForBrand } from "@/lib/hot-games/adapter";

/**
 * POST /api/hot-games/fetch-preview
 *
 * Admin-only dev endpoint for inspecting the Hot Games live adapter
 * output for a given brand. Returns the raw `HotGamesAdapterResult`,
 * including the frozen snapshot `facts` that refine cycles must reuse
 * (see docs/07-ai-boundaries.md Hot Games Frozen Snapshot).
 *
 * Gated two ways (shared `ALLOW_ADMIN_BQ_PREVIEW` flag with Big Wins):
 *   1. `ALLOW_ADMIN_BQ_PREVIEW=true` env flag
 *   2. Admin role
 *
 * Body:
 *   {
 *     brand_id:              string,
 *     source_window_minutes: 30 | 60 | 90 | 120,
 *     hot_games_count:       integer 3..10,
 *     time_mapping:          string[] ("HH:MM", strictly ascending, length = count),
 *     time_slot_summary?:    string (auto-derived when omitted)
 *   }
 *
 * Adapter-side `validateHotGamesInput()` is the final arbiter — input
 * validation here is a Zod pre-filter; errors on the adapter side
 * return status="error" + INVALID_INPUT.
 */

const BodySchema = z.object({
  brand_id: z.string().min(1),
  source_window_minutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
  hot_games_count: z.number().int().min(3).max(10),
  time_mapping: z.array(z.string()).min(3).max(10),
  time_slot_summary: z.string().optional(),
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

  const result = await fetchHotGamesForBrand({
    brand_id: parsed.data.brand_id,
    source_window_minutes: parsed.data.source_window_minutes,
    hot_games_count: parsed.data.hot_games_count,
    time_mapping: parsed.data.time_mapping,
    time_slot_summary: parsed.data.time_slot_summary,
  });

  return ok(result);
}
