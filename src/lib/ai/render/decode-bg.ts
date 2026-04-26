// Decodes the `data:` URI form of a background image so Satori can
// embed it. The visual compiler doesn't produce the URI — the image
// provider (`generateBackgroundImage()`) does. The renderer just
// needs to validate + extract the bytes for embedding.
//
// Why this lives in its own file:
//   - the future GCS storage migration swaps `data:` URIs for `https:`
//     URLs; that change touches only this module (we'll fetch instead
//     of decode)

export interface DecodedBackground {
  /** MIME type extracted from the data URI (e.g. "image/png"). */
  mime: string;
  /** Raw decoded bytes. */
  bytes: Uint8Array;
  /** Echo of the original data URI for direct embedding in Satori
   *  (Satori prefers data URIs for inline images; bytes are kept
   *  separately in case future code needs them). */
  data_uri: string;
}

/**
 * Returns the decoded background or `null` when the input is
 * empty / not a data URI. Throws on malformed data URIs (the
 * orchestrator catches and classifies as
 * `BACKGROUND_DECODE_FAILED`).
 */
export function decodeBackground(artifactUrl: string | null): DecodedBackground | null {
  if (!artifactUrl || typeof artifactUrl !== "string") return null;
  if (!artifactUrl.startsWith("data:")) {
    // GCS migration follow-up: when artifact_url becomes an https URL
    // this branch becomes the fetch path. For now, anything other
    // than a data URI is treated as "no artifact available" — the
    // renderer falls back to brand-color background.
    return null;
  }

  const commaIdx = artifactUrl.indexOf(",");
  if (commaIdx < 0) {
    throw new Error("Background artifact_url is not a valid data URI (missing comma)");
  }
  const meta = artifactUrl.slice(5, commaIdx); // drop "data:" prefix
  const payload = artifactUrl.slice(commaIdx + 1);

  // Expected meta shape: "<mime>;base64". Anything else we treat as
  // malformed for MVP (the only producer is our Gemini adapter which
  // always emits base64).
  if (!meta.endsWith(";base64")) {
    throw new Error(`Background artifact_url is not base64-encoded (meta="${meta}")`);
  }
  const mime = meta.slice(0, meta.length - ";base64".length) || "image/png";

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(payload, "base64"));
  } catch (err) {
    throw new Error(
      `Background artifact_url base64 payload could not be decoded: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { mime, bytes, data_uri: artifactUrl };
}
