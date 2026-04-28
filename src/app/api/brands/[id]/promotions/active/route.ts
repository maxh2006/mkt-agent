// Lightweight read-only endpoint that powers the Promo ID / Promo Name
// dropdowns on the Automation Rules → On Going Promotions tab.
//
// Returns the SAME live promo set the orchestrator processes at run
// time (active + not-expired, filtered by the adapter's normalizer).
// Stripped to just the {promo_id, promo_name} tuple — operators just
// need enough to fill in the rule config.
//
// Auth: any session user with access to this brand. (The Automation
// Rules page already gates *editing* via canEdit; this endpoint is
// read-only and the data isn't sensitive — promo ids and titles.)
//
// Not env-gated (unlike the admin debug `/api/promotions/fetch-preview`).
// This is operator-facing routine UX.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getActiveBrand } from "@/lib/active-brand";
import { ok, Errors, sessionUser } from "@/lib/api";
import { fetchPromotionsForBrand } from "@/lib/promotions/adapter";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();

  const { id: brandId } = await params;

  // Brand-access gate: the user must have this brand in their
  // accessible-brands set. Mirrors the pattern in /api/automations.
  const ctx = await getActiveBrand(user.id, user.role);
  if (!ctx.brandIds.includes(brandId)) return Errors.FORBIDDEN();

  const result = await fetchPromotionsForBrand(brandId);

  // Strip to {promo_id, promo_name}, sort by name ASC for stable
  // operator scanning order.
  const promotions = result.promos
    .map((p) => ({ promo_id: p.promo_id, promo_name: p.promo_title }))
    .sort((a, b) => a.promo_name.localeCompare(b.promo_name));

  return ok({
    brand_id: brandId,
    fetched_at: result.fetched_at,
    promotions,
    error: result.error
      ? { code: result.error.code, message: result.error.message }
      : undefined,
  });
}
