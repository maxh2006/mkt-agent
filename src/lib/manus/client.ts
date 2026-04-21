import type { ManusDispatchPayload, ManusDispatchResult, ManusErrorCode } from "./types";

/**
 * dispatchToManus — handoff boundary between our dispatcher and the Manus worker.
 *
 * If MANUS_AGENT_ENDPOINT is not set, logs the payload and returns
 * `{ accepted: true, dry_run: true }` so the rest of the pipeline can be
 * exercised without a live Manus. When the endpoint is configured, performs
 * a POST with MANUS_API_KEY as bearer auth.
 *
 * Contract (stable, finalized MVP protocol — see docs/00-architecture.md):
 *   Request body:  ManusDispatchPayload
 *   Response body on 2xx:  { accepted: true, external_ref?: string }
 *   Response body on non-2xx (or thrown): mapped to
 *     { accepted: false, error: string, error_code?: ManusErrorCode }
 *
 * Per-platform success/failure does NOT come from this response — it arrives
 * asynchronously via the callback route (`POST /api/manus/callback`). This
 * function only reports whether Manus accepted the job.
 */
export async function dispatchToManus(payload: ManusDispatchPayload): Promise<ManusDispatchResult> {
  const endpoint = process.env.MANUS_AGENT_ENDPOINT;
  const apiKey = process.env.MANUS_API_KEY;

  if (!endpoint) {
    // Dry-run mode — Manus not configured yet. Keep this log since it's the only
    // visible signal during placeholder runs.
    console.log(
      `[manus] dry-run dispatch delivery=${payload.delivery_id} platform=${payload.platform} post=${payload.post_id}`,
    );
    return { accepted: true, dry_run: true };
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as {
      external_ref?: string;
      error?: string;
      error_code?: ManusErrorCode;
    };

    if (!res.ok) {
      return {
        accepted: false,
        dry_run: false,
        error:
          body.error ??
          `Manus responded ${res.status}`,
        error_code: body.error_code,
      };
    }

    return {
      accepted: true,
      dry_run: false,
      external_ref: body.external_ref,
    };
  } catch (err) {
    return {
      accepted: false,
      dry_run: false,
      error: err instanceof Error ? err.message : "Manus handoff failed",
      error_code: "NETWORK_ERROR",
    };
  }
}
