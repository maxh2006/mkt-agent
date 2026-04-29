// GCS-backed artifact storage for the deterministic overlay renderer.
//
// Module scope (deliberately narrow):
//   - one upload helper for the FINAL composited PNG
//   - returns a permanent public-read https URL on success
//   - returns a structured StorageError on failure (orchestrator catches +
//     persists to `composited_image.error_code` for failure isolation)
//
// What this module does NOT do:
//   - upload AI background artifacts (those stay as `data:` URIs in
//     `image_generation.artifact_url`; debug metadata only, not
//     publishable)
//   - manage bucket lifecycle / cleanup (rejected drafts' artifacts
//     stay until a future cleanup job; out of scope)
//   - signed URLs / private buckets (locked decision: public-read
//     bucket; permanent URLs match the marketing-image use case
//     where the images go public on Meta/Telegram anyway)
//   - auto-create buckets / set IAM (one-time gcloud runbook lives in
//     docs/08-deployment.md; app never mutates infra)
//
// Auth: ADC (Application Default Credentials). Prod uses the VM's
// attached service account via metadata service. Local dev uses
// `gcloud auth application-default login` (already set up for BQ).
// No JSON key files in code. Mirrors the @google-cloud/bigquery auth
// pattern at src/lib/bq/client.ts.
//
// Object path:
//   - `generated/<brand_id>/<sample_group_id>/<sample_index>.png`
//     (when `sample_index` is provided; per-sample restructure
//     2026-04-29 — each sibling has its own image, so each gets its
//     own object).
//   - `generated/<brand_id>/<sample_group_id>.png`
//     (legacy / off-pipeline callers; one composite per run).
// The brand_id prefix lets us list / clean per-brand later.

import { Storage } from "@google-cloud/storage";

/**
 * Stable taxonomy for storage failures. Mirrors
 * `ImageProviderErrorCode` shape so future operator UX can treat the
 * two failure surfaces uniformly. Surfaced via
 * `composited_image.error_code` when the orchestrator catches an
 * upload failure.
 */
export type StorageErrorCode =
  | "STORAGE_NOT_CONFIGURED"   // GCS_ARTIFACT_BUCKET env unset; orchestrator should skip
  | "STORAGE_AUTH_FAILED"      // ADC failed / SA missing required role
  | "STORAGE_UPLOAD_FAILED"    // bucket exists, auth works, save() failed (network / quota / etc.)
  | "STORAGE_UNKNOWN";         // anything else

export class StorageError extends Error {
  constructor(public code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
  }
}

export interface UploadCompositedArgs {
  brand_id: string;
  sample_group_id: string;
  /** Per-sample index when each sibling has its own image. When set,
   *  the object path becomes `generated/<brand>/<group>/<index>.png`.
   *  When absent, falls back to the legacy `generated/<brand>/<group>.png`
   *  path (single composite per group). */
  sample_index?: number;
  bytes: Uint8Array;
  /** Defaults to "image/png". */
  content_type?: string;
}

export interface UploadCompositedResult {
  url: string;          // https://storage.googleapis.com/<bucket>/<object_path>
  bucket: string;
  object_path: string;
  mime_type: string;
  byte_length: number;
  uploaded_at: string;  // ISO
}

/**
 * Returns true iff the env is configured to upload to GCS. The
 * orchestrator skips the upload step entirely when this returns
 * false (composite stays as a `data:` URI in
 * `composited_image.artifact_url`; `Post.image_url` stays null —
 * the safe-fallback path that worked before this migration).
 */
export function isStorageConfigured(): boolean {
  return !!process.env.GCS_ARTIFACT_BUCKET?.trim();
}

// Lazy singleton — Storage() reads ADC at construction. Holding a
// module-level instance avoids re-auth per upload while keeping the
// lib-side interface synchronous.
let _storage: Storage | null = null;
function getStorage(): Storage {
  if (_storage) return _storage;
  _storage = new Storage();
  return _storage;
}

/**
 * Upload the composited PNG to GCS. Object path is deterministic:
 * `generated/<brand_id>/<sample_group_id>.png`. The bucket is
 * expected to already exist with public-read at the bucket level
 * (uniform-bucket-level-access + allUsers:objectViewer); see
 * `docs/08-deployment.md` "GCS artifact bucket — one-time setup" for
 * the gcloud commands.
 *
 * Throws `StorageError` on any failure; the orchestrator catches it.
 */
export async function uploadCompositedPng(
  args: UploadCompositedArgs,
): Promise<UploadCompositedResult> {
  const bucket_name = process.env.GCS_ARTIFACT_BUCKET?.trim();
  if (!bucket_name) {
    throw new StorageError(
      "STORAGE_NOT_CONFIGURED",
      "GCS_ARTIFACT_BUCKET is not set; storage is unavailable",
    );
  }

  const mime_type = args.content_type ?? "image/png";
  const object_path =
    typeof args.sample_index === "number"
      ? `generated/${sanitizeSegment(args.brand_id)}/${sanitizeSegment(args.sample_group_id)}/${sanitizeSegment(String(args.sample_index))}.png`
      : `generated/${sanitizeSegment(args.brand_id)}/${sanitizeSegment(args.sample_group_id)}.png`;
  const startedAt = Date.now();

  try {
    const bucket = getStorage().bucket(bucket_name);
    const file = bucket.file(object_path);
    // Buffer.from(Uint8Array) is the safe overload — passing the raw
    // Uint8Array works with the GCS SDK's save() but Buffer is the
    // documented input type.
    await file.save(Buffer.from(args.bytes), {
      contentType: mime_type,
      metadata: {
        contentType: mime_type,
        // Artifacts are content-addressed by sample_group_id (UUID);
        // they're never re-written. Long cache + immutable saves
        // bandwidth for repeat fetches by Manus / clients.
        cacheControl: "public, max-age=31536000, immutable",
      },
      // resumable=false for small payloads (composite PNGs are
      // ~100KB-1MB). Avoids the resumable-upload session round-trip.
      resumable: false,
    });

    const url = `https://storage.googleapis.com/${encodeURIComponent(bucket_name)}/${object_path}`;
    const result: UploadCompositedResult = {
      url,
      bucket: bucket_name,
      object_path,
      mime_type,
      byte_length: args.bytes.byteLength,
      uploaded_at: new Date(startedAt).toISOString(),
    };

    console.log(
      `[storage-gcs] uploaded brand=${args.brand_id} group=${args.sample_group_id} bucket=${bucket_name} path=${object_path} bytes=${args.bytes.byteLength} duration_ms=${Date.now() - startedAt}`,
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = classifyStorageError(message);
    console.warn(
      `[storage-gcs] FAILED brand=${args.brand_id} group=${args.sample_group_id} bucket=${bucket_name} path=${object_path} code=${code} err=${message}`,
    );
    throw new StorageError(code, message);
  }
}

/**
 * Map GCS SDK error messages onto the canonical taxonomy. The SDK
 * doesn't expose stable error codes for all failure modes, so we
 * heuristically look at the message. Exhaustive matching isn't the
 * goal — operators just need to distinguish "auth issue" from
 * "transient upload" from "everything else".
 */
export function classifyStorageError(message: string): StorageErrorCode {
  const m = message.toLowerCase();
  if (
    /could not load the default credentials|application default credentials|unauthenticated|invalid_grant/i.test(m)
  ) {
    return "STORAGE_AUTH_FAILED";
  }
  if (/permission|403|forbidden|access denied/i.test(m)) {
    return "STORAGE_AUTH_FAILED";
  }
  if (/etimedout|econnreset|enotfound|network|fetch failed/i.test(m)) {
    return "STORAGE_UPLOAD_FAILED";
  }
  if (/^GCS_ARTIFACT_BUCKET is not set/.test(message)) {
    return "STORAGE_NOT_CONFIGURED";
  }
  return "STORAGE_UNKNOWN";
}

/**
 * Defensive sanitizer for path segments. brand_id and sample_group_id
 * come from our own DB (cuids / UUIDs respectively) so they're
 * already safe in practice — but a stray `/` or whitespace would
 * silently rewrite the object hierarchy. Reject any non-alphanumeric-
 * dash-underscore character by replacing it with `_`. Truncate to
 * 200 chars to stay well under GCS's 1024-byte object name limit.
 */
function sanitizeSegment(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned;
}
