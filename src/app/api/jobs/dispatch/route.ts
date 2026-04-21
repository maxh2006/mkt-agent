import { NextRequest } from "next/server";
import { ok, Errors } from "@/lib/api";
import { runManusDispatcher } from "@/lib/manus/dispatcher";

/**
 * POST /api/jobs/dispatch
 *
 * Triggers one pass of the Manus dispatcher. Designed to be called by a cron
 * (GCP Scheduler / Vercel Cron / plain crontab via curl). NOT meant for end users.
 *
 * Authentication: shared secret in header `x-dispatch-secret` matching
 * env var MANUS_DISPATCH_SECRET. Request is rejected with 401 if the header
 * does not match, or with 503 if the secret is not configured on the server
 * (so we don't silently accept anonymous pokes).
 */
export async function POST(req: NextRequest) {
  const configured = process.env.MANUS_DISPATCH_SECRET;
  if (!configured) {
    return Errors.VALIDATION("MANUS_DISPATCH_SECRET is not configured on the server");
  }

  const header = req.headers.get("x-dispatch-secret");
  if (header !== configured) return Errors.UNAUTHORIZED();

  const summary = await runManusDispatcher();
  return ok(summary);
}
