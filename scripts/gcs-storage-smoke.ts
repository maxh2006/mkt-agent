/**
 * GCS artifact storage smoke.
 *
 * Round-trips a tiny test PNG through `uploadCompositedPng()` and
 * fetches the resulting URL via plain https GET to confirm:
 *   - ADC auth works (or fails loudly with a clear classification)
 *   - the bucket exists + has public-read at the bucket level
 *   - the storage helper writes objects to the expected path
 *   - the public URL serves bytes correctly
 *
 * Run: `npm run gcs:smoke`
 *
 * Prereqs (one-time, see docs/08-deployment.md "GCS artifact bucket"):
 *   - GCS_ARTIFACT_BUCKET set in .env
 *   - bucket created with uniform-bucket-level-access
 *   - allUsers:objectViewer granted (public-read)
 *   - VM service account (or `gcloud auth application-default login`
 *     locally) granted roles/storage.objectAdmin on the bucket
 *
 * COSTS REAL MONEY: ~$0.0001 (one PUT + one GET on a ~70-byte
 * object). The smoke uses a deterministic test object path so
 * repeated runs overwrite the same key.
 */

import "dotenv/config";
import { isStorageConfigured, uploadCompositedPng } from "@/lib/storage/gcs";

// Smallest valid PNG payload (1x1 transparent pixel, 67 bytes).
// base64-encoded so we don't ship binary data in this smoke script.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function main() {
  if (!isStorageConfigured()) {
    console.error(
      "[gcs-smoke] GCS_ARTIFACT_BUCKET is not set in .env — storage helper would skip uploads. See docs/08-deployment.md 'GCS artifact bucket' for setup.",
    );
    process.exit(2);
  }

  const bytes = new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64"));
  console.log(
    `[gcs-smoke] uploading test PNG (${bytes.byteLength} bytes) to bucket=${process.env.GCS_ARTIFACT_BUCKET}`,
  );

  const t0 = Date.now();
  const result = await uploadCompositedPng({
    brand_id: "smoke-brand",
    sample_group_id: "smoke-test",
    bytes,
  });
  console.log(
    `[gcs-smoke] uploaded in ${Date.now() - t0}ms\n  url:    ${result.url}\n  path:   ${result.object_path}\n  bytes:  ${result.byte_length}`,
  );

  // Round-trip: fetch the URL and assert the bytes match.
  const fetched = await fetch(result.url);
  if (!fetched.ok) {
    console.error(
      `[gcs-smoke] FAILED: GET ${result.url} returned ${fetched.status} ${fetched.statusText}. Check bucket public-read IAM (allUsers:objectViewer).`,
    );
    process.exit(1);
  }
  const fetchedBytes = new Uint8Array(await fetched.arrayBuffer());
  if (fetchedBytes.byteLength !== bytes.byteLength) {
    console.error(
      `[gcs-smoke] FAILED: round-trip byte length mismatch. uploaded=${bytes.byteLength} fetched=${fetchedBytes.byteLength}`,
    );
    process.exit(1);
  }
  for (let i = 0; i < bytes.byteLength; i++) {
    if (bytes[i] !== fetchedBytes[i]) {
      console.error(
        `[gcs-smoke] FAILED: byte mismatch at offset ${i} (uploaded=${bytes[i]} fetched=${fetchedBytes[i]})`,
      );
      process.exit(1);
    }
  }

  console.log(`[gcs-smoke] OK — round-trip verified end-to-end`);
}

main().catch((err) => {
  console.error("[gcs-smoke] threw:", err);
  process.exit(1);
});
