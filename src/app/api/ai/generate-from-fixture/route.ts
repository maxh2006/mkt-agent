import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, Errors, sessionUser } from "@/lib/api";
import {
  runGeneration,
  brandOr404,
  normalizers,
  fixtures,
} from "@/lib/ai/generate";
import type { Platform } from "@/generated/prisma/enums";

/**
 * POST /api/ai/generate-from-fixture
 *
 * Admin-only dev endpoint. Drives the generation pipeline against a
 * bundled fixture so we can exercise the whole flow (prompt build →
 * provider stub → draft insert) end-to-end with no live source data.
 *
 * Gated two ways:
 *   1. Admin-only (role check).
 *   2. `ALLOW_AI_FIXTURES` env flag must be "true" — prevents accidental
 *      draft spam on a prod deployment where admin access is broader than
 *      the dev team.
 *
 * Body:
 *   { source_type: "big_win" | "promo" | "hot_games" | "educational",
 *     brand_id:    string,
 *     platform?:   Platform (default "facebook"),
 *     sample_count?: number }
 *
 * Events are NOT supported here — event-derived generation has its own
 * route at /api/events/[id]/generate-drafts which loops over occurrences.
 */

const PLATFORMS = ["instagram", "facebook", "twitter", "tiktok", "telegram"] as const;

const BodySchema = z.object({
  source_type: z.enum(["big_win", "promo", "hot_games", "educational"]),
  brand_id: z.string().min(1),
  platform: z.enum(PLATFORMS).optional(),
  sample_count: z.number().int().min(1).max(10).optional(),
});

export async function POST(req: NextRequest) {
  // Gate 1: env flag
  if (process.env.ALLOW_AI_FIXTURES !== "true") {
    return Errors.VALIDATION("Fixture generation disabled. Set ALLOW_AI_FIXTURES=true to enable.");
  }

  // Gate 2: admin-only
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Errors.VALIDATION(parsed.error.issues[0]?.message ?? "Invalid payload");
  }
  const { source_type, brand_id, sample_count } = parsed.data;
  const platform = (parsed.data.platform ?? "facebook") as Platform;

  const brand = await brandOr404(brand_id).catch(() => null);
  if (!brand) return Errors.NOT_FOUND("Brand");

  // Build a NormalizedGenerationInput from the matching fixture.
  const input = (() => {
    switch (source_type) {
      case "big_win":
        return normalizers.normalizeBigWin({
          brand,
          facts: fixtures.bigWinFixture(),
          platform,
          sample_count,
        });
      case "promo":
        return normalizers.normalizePromo({
          brand,
          facts: fixtures.promoFixture(),
          platform,
          sample_count,
        });
      case "hot_games":
        return normalizers.normalizeHotGames({
          brand,
          facts: fixtures.hotGamesFixture(),
          platform,
          sample_count,
        });
      case "educational":
        return normalizers.normalizeEducational({
          brand,
          facts: fixtures.educationalFixture(),
          platform,
          sample_count,
        });
    }
  })();

  const result = await runGeneration({ input, created_by: user.id });

  return ok({
    source_type,
    brand_id,
    platform,
    sample_group_id: input.sample_group_id,
    ...result,
  });
}
