import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Verifies a Manus callback signature.
 *
 * Manus must send the header `x-manus-signature: sha256=<hex>` where `<hex>`
 * is the lowercase hex HMAC-SHA256 of the raw request body keyed by
 * `MANUS_WEBHOOK_SECRET`.
 *
 * Comparison is constant-time. All failure modes (missing header, malformed
 * prefix, wrong length, non-hex bytes, mismatch) return `false` — callers
 * should not leak which failure occurred.
 */
export function verifyManusSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (received.length !== expected.length) return false;
  try {
    const a = Buffer.from(received, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
