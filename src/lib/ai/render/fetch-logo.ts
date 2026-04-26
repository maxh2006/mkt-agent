// Optional brand-logo fetcher for the overlay renderer.
//
// Brand logos are operator-set URLs in `Brand.design_settings_json.logos`.
// The renderer needs the bytes inline (Satori embeds images as data
// URIs in its SVG output). This helper fetches the URL with the same
// host-privacy guard the Manus media-validation layer uses, so a
// hand-edited or compromised logo URL can't trick the server into
// hitting a private internal target (SSRF).
//
// Failures are NEVER fatal for the renderer — we just skip the logo.

import { isPrivateHost } from "@/lib/manus/media-validation";

const FETCH_TIMEOUT_MS = 5_000;
/** Cap inline-embedded logos at 2 MB. Satori chokes on large images
 *  and most brand logos are well under 200 KB anyway. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export interface FetchedLogo {
  /** Data URI suitable for embedding in Satori `<img src=...>`. */
  data_uri: string;
  /** MIME type extracted from the response Content-Type. */
  mime: string;
  /** Decoded byte length (for log lines). */
  byte_length: number;
}

/**
 * Returns the fetched logo as a data URI, or `null` on any failure
 * (empty URL, bad scheme, private host, fetch error, oversize, etc.).
 * The renderer treats a `null` return as "skip the logo" — never an
 * error.
 */
export async function fetchLogoBytes(rawUrl: string | null): Promise<FetchedLogo | null> {
  if (!rawUrl || rawUrl.trim().length === 0) return null;

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isPrivateHost(url.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;

    // Validate Content-Type is image-shaped before reading the body.
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() || "";
    if (!mime.startsWith("image/")) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_LOGO_BYTES) return null;

    const bytes = new Uint8Array(buf);
    const b64 = Buffer.from(bytes).toString("base64");
    return {
      data_uri: `data:${mime};base64,${b64}`,
      mime,
      byte_length: bytes.byteLength,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
