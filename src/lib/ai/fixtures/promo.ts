import type { PromoFacts } from "../types";

/**
 * Mock Running Promotion payload. Shaped like what the brand's own
 * promotions API is expected to return (see docs/02-data-model.md —
 * Brand integration fields).
 */
export function promoFixture(overrides?: Partial<PromoFacts>): PromoFacts {
  return {
    kind: "promo",
    promo_id: "promo-weekly-cashback-2026-04",
    promo_title: "Weekly Cashback — 15% back on slot losses",
    mechanics:
      "Play any slot game Monday through Sunday. Every Monday we refund 15% of your net losses from the previous week up to a maximum of ₱5,000.",
    reward: "Up to ₱5,000 cashback weekly",
    period_start: "2026-04-21T00:00:00+08:00",
    period_end: "2026-04-27T23:59:59+08:00",
    min_deposit: 500,
    terms_summary:
      "Must be an active player with at least one deposit in the cycle. Cashback credited as bonus funds; 1x playthrough on slots.",
    ...overrides,
  };
}
