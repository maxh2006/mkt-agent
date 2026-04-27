// Admin-only verification + manual trigger for the Running Promotions
// automation orchestrator. Returns the structured PromoAutomationRunResult
// JSON so ops dashboards / future Cloud Scheduler triggers / curl-from-
// terminal can all consume the same shape.
//
// Body (all optional):
//   { "brand_id"?: string }   // scope to a single brand for verification
//
// Per the cadence/scope locked in the plan:
//   - admin-only (no operator-self-service)
//   - manual trigger today; a future Cloud Scheduler job (similar to
//     mkt-agent-dispatch for Manus) will hit this same route on a
//     cadence
//   - drafts only — no auto-approval, no delivery rows, no publishing

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { Errors, ok, sessionUser } from "@/lib/api";
import { runRunningPromotionsAutomation } from "@/lib/automations/running-promotions/orchestrator";

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = sessionUser(session);
  if (!user) return Errors.UNAUTHORIZED();
  if (user.role !== "admin") return Errors.FORBIDDEN();

  // Body is optional; tolerate empty / non-JSON bodies cleanly.
  const body = await req.json().catch(() => null);
  const brand_id_filter =
    body && typeof body === "object" && typeof body.brand_id === "string"
      ? body.brand_id
      : undefined;

  try {
    const result = await runRunningPromotionsAutomation({ brand_id_filter });
    return ok(result);
  } catch (err) {
    // The orchestrator only throws on configuration errors that block
    // the entire run (e.g. no admin user found). Surface as 500 with
    // the underlying message so ops can see what to fix.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[automation:promo] orchestrator threw: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
