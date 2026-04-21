import type { ManusDispatchPayload, ManusDispatchResult } from "./types";

/**
 * dispatchToManus — handoff boundary between our dispatcher and the Manus worker.
 *
 * Current state: placeholder. If MANUS_AGENT_ENDPOINT is not set, logs the payload
 * and returns `{ accepted: true, dry_run: true }` so the rest of the pipeline can be
 * exercised without a live Manus. When the endpoint is configured, performs a POST
 * with MANUS_API_KEY as bearer auth.
 *
 * Contract (stable): given a ManusDispatchPayload, return a ManusDispatchResult.
 * The dispatcher MUST NOT look beyond this result — per-platform success/failure
 * arrives asynchronously via a future callback route (out of scope here).
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

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        accepted: false,
        dry_run: false,
        error: `Manus responded ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    // The real Manus response shape is TBD. For now we extract an optional
    // external_ref if present, otherwise just accept.
    const body = (await res.json().catch(() => ({}))) as { external_ref?: string };
    return { accepted: true, dry_run: false, external_ref: body.external_ref };
  } catch (err) {
    return {
      accepted: false,
      dry_run: false,
      error: err instanceof Error ? err.message : "Manus handoff failed",
    };
  }
}
