// Pre-dispatch media URL validation for the Manus handoff boundary.
//
// Manus expects media references in `publish_payload` (future field,
// e.g. `media_urls`) to be **publicly fetchable HTTP(S) URLs**. Before
// every dispatch that carries media, we:
//
//   1. Parse the URL syntactically (must be a valid `URL()`).
//   2. Require http: or https: scheme.
//   3. Reject private / loopback / link-local hosts (SSRF hygiene + catches
//      obvious "I pasted a localhost URL" mistakes).
//   4. Perform a lightweight HEAD request (5s timeout, 3-hop redirect cap)
//      with a GET `Range: bytes=0-0` fallback for servers that answer HEAD
//      with 405/501.
//
// Any failure is translated into a single `MediaValidationIssue` with a
// typed `reason` + operator-facing `message`. The dispatcher formats these
// into `[MEDIA_ERROR] <reason>` and writes them to
// `PostPlatformDelivery.last_error`, which the existing retryability
// classifier (`src/lib/manus/retryability.ts`) already maps to a fatal
// failure.
//
// This module is pure (no Prisma) + runs in Node-only contexts (dispatcher
// + smoke script). No new deps — uses Node 22 built-in `fetch`.

import type { Post } from "@/generated/prisma/client";

// ─── Public types ───────────────────────────────────────────────────────────

export type MediaValidationReason =
  | "invalid_url"         // URL() parser rejected
  | "unsupported_scheme"  // not http/https
  | "private_host"        // loopback / RFC1918 / link-local / .local
  | "unreachable"         // DNS / network / timeout / non-Response error
  | "http_error";         // 4xx / 5xx after HEAD + GET-Range fallback

export interface MediaValidationIssue {
  url: string;
  reason: MediaValidationReason;
  message: string;
  http_status?: number;
}

export interface MediaValidationResult {
  ok: boolean;
  /** Unique URLs actually checked (post-dedupe). */
  checked: string[];
  /** One entry per URL that failed any step. Empty when ok=true. */
  issues: MediaValidationIssue[];
}

export interface ValidateOptions {
  /** Per-URL timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Caller-provided fetch (for tests/mocks). Default: global fetch. */
  fetchImpl?: typeof fetch;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT = "mkt-agent-media-check/1.0";
const MAX_REDIRECTS = 3;

// ─── collectMediaUrls — extension point ─────────────────────────────────────

/**
 * Returns the list of media URLs associated with a Post that should be
 * validated before dispatch.
 *
 * TODAY (2026-04-23): returns `[]` for every Post — no per-post media URL
 * field exists yet (`grep image_url|media_url` over the codebase returns
 * zero hits). `Post.image_prompt` is narrative AI input, NOT a URL, so it
 * is NEVER returned here.
 *
 * FUTURE extension point: when `Post.image_url` (or a structured
 * `media_urls: string[]`) lands as a column, return the non-empty values
 * from here. That is the full integration required to activate this
 * layer for real traffic — the dispatcher is already wired.
 */
export function collectMediaUrls(_post: Pick<Post, "image_prompt">): string[] {
  // Intentionally empty. See JSDoc for the future extension shape.
  // `_post` parameter is retained so the call site stays stable when the
  // extension lands (no dispatcher code change needed for the plumbing).
  return [];
}

// ─── Public validators ──────────────────────────────────────────────────────

/**
 * Validate a single URL. Returns `null` on pass, a typed issue on fail.
 * Runs syntactic → scheme → host checks synchronously before the network
 * round-trip, so obvious failures short-circuit with zero fetches.
 */
export async function validateMediaUrl(
  raw: string,
  opts: ValidateOptions = {},
): Promise<MediaValidationIssue | null> {
  const staticIssue = checkStatic(raw);
  if (staticIssue) return staticIssue;

  // checkStatic ran URL() successfully, so re-parse is safe.
  const parsed = new URL(raw);
  return checkReachability(parsed, opts);
}

/**
 * Validate a batch of URLs. Dedupes input, runs checks in parallel,
 * aggregates into a single `MediaValidationResult`.
 *
 * Empty input returns ok=true without any network activity.
 */
export async function validateMediaUrls(
  urls: string[],
  opts: ValidateOptions = {},
): Promise<MediaValidationResult> {
  const deduped = Array.from(new Set(urls.map((u) => u.trim()).filter((u) => u.length > 0)));

  if (deduped.length === 0) {
    return { ok: true, checked: [], issues: [] };
  }

  const results = await Promise.all(
    deduped.map((u) => validateMediaUrl(u, opts)),
  );

  const issues = results.filter((r): r is MediaValidationIssue => r !== null);

  return {
    ok: issues.length === 0,
    checked: deduped,
    issues,
  };
}

// ─── Operator-facing formatting ─────────────────────────────────────────────

/**
 * Build the reason string embedded in `PostPlatformDelivery.last_error`.
 * Lives next to the classifier's `[MEDIA_ERROR] <reason>` format. Keeps
 * the top-level message short so the Delivery Status modal's single line
 * remains readable; enumerates "+N more" when there are multiple failing
 * URLs.
 */
export function formatMediaErrorMessage(result: MediaValidationResult): string {
  if (result.ok) return "";
  const [first, ...rest] = result.issues;
  const primary = `${first.message} (${first.reason})`;
  return rest.length === 0 ? primary : `${primary} (+${rest.length} more)`;
}

// ─── Observability ──────────────────────────────────────────────────────────

/**
 * One line per pre-dispatch check. No URL values (length only) so logs
 * stay under typical budget + never leak private paths.
 */
export function logMediaCheck(args: {
  delivery_id: string;
  platform: string;
  result: MediaValidationResult;
  action: "dispatched" | "blocked";
}): void {
  const { delivery_id, platform, result, action } = args;
  const issues = result.issues.map((i) => i.reason).join(",") || "(none)";
  console.log(
    `[manus-media] delivery=${delivery_id} platform=${platform} urls=${result.checked.length} result=${result.ok ? "ok" : "failed"} issues=${issues} action=${action}`,
  );
}

// ─── Internal: syntactic + host checks ──────────────────────────────────────

function checkStatic(raw: string): MediaValidationIssue | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      url: raw,
      reason: "invalid_url",
      message: "URL did not parse",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url: raw,
      reason: "unsupported_scheme",
      message: `Scheme must be http or https (got ${parsed.protocol.replace(":", "")})`,
    };
  }

  if (isPrivateHost(parsed.hostname)) {
    return {
      url: raw,
      reason: "private_host",
      message: `Host ${parsed.hostname} is private / non-public`,
    };
  }

  return null;
}

/**
 * True when the host is definitely not a public Internet address.
 * Handles:
 *   - `localhost`, empty hostname
 *   - `.local` suffix (mDNS)
 *   - IPv4 loopback 127.0.0.0/8
 *   - IPv4 RFC1918: 10/8, 172.16/12, 192.168/16
 *   - IPv4 link-local 169.254/16
 *   - IPv6 loopback `::1`
 *   - IPv6 link-local `fe80::/10`
 *   - IPv6 ULA `fc00::/7`
 *
 * Deliberately does NOT resolve DNS — that would add a network round-trip
 * and a DNS-rebinding attack vector. Reachability step catches hosts
 * that resolve to private IPs by returning a fetch error, which the
 * reachability path classifies as `unreachable`.
 */
export function isPrivateHost(hostname: string): boolean {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();

  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".localhost")) {
    return true;
  }

  // IPv6 in brackets? new URL strips the brackets from `hostname`, but be
  // defensive if a caller passes the raw `host` field.
  const bare = lower.replace(/^\[|\]$/g, "");

  // IPv4
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 127) return true;                          // loopback
    if (a === 10) return true;                           // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;    // RFC1918
    if (a === 192 && b === 168) return true;             // RFC1918
    if (a === 169 && b === 254) return true;             // link-local
    if (a === 0) return true;                            // "this network"
    return false;
  }

  // IPv6 (coarse but covers the common private prefixes)
  if (bare === "::1") return true;
  if (bare.startsWith("fe8") || bare.startsWith("fe9") || bare.startsWith("fea") || bare.startsWith("feb")) {
    // fe80::/10 — link-local
    return true;
  }
  if (/^f[cd]/.test(bare)) {
    // fc00::/7 — unique local
    return true;
  }

  return false;
}

// ─── Internal: reachability ─────────────────────────────────────────────────

async function checkReachability(
  url: URL,
  opts: ValidateOptions,
): Promise<MediaValidationIssue | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // HEAD first
  const headResult = await tryFetch(fetchImpl, url, { method: "HEAD", timeoutMs });

  if (headResult.kind === "response") {
    // Some servers reject HEAD with 405/501 but serve GET — fall back.
    if (headResult.status === 405 || headResult.status === 501) {
      return followUpWithRangeGet(fetchImpl, url, timeoutMs);
    }
    return statusToIssue(url.href, headResult.status);
  }

  // HEAD itself errored (network / timeout / redirect cap). Try GET-Range
  // once more — some hosts throw on HEAD but respond to GET.
  return followUpWithRangeGet(fetchImpl, url, timeoutMs, headResult.message);
}

async function followUpWithRangeGet(
  fetchImpl: typeof fetch,
  url: URL,
  timeoutMs: number,
  headErrorMessage?: string,
): Promise<MediaValidationIssue | null> {
  const getResult = await tryFetch(fetchImpl, url, {
    method: "GET",
    timeoutMs,
    headers: { Range: "bytes=0-0" },
  });

  if (getResult.kind === "response") {
    return statusToIssue(url.href, getResult.status);
  }

  // Both HEAD and GET-Range failed. Report the GET error (more recent + the
  // definitive signal); fall back to HEAD message when GET produced nothing.
  return {
    url: url.href,
    reason: "unreachable",
    message: getResult.message || headErrorMessage || "fetch failed",
  };
}

interface ResponseOutcome {
  kind: "response";
  status: number;
}
interface ErrorOutcome {
  kind: "error";
  message: string;
}
type FetchOutcome = ResponseOutcome | ErrorOutcome;

async function tryFetch(
  fetchImpl: typeof fetch,
  url: URL,
  opts: {
    method: "HEAD" | "GET";
    timeoutMs: number;
    headers?: Record<string, string>;
  },
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  let redirectCount = 0;
  let currentUrl: URL = url;

  try {
    // Manual redirect tracking so we can cap hops AND re-check private-host
    // on every hop (defence against open-redirect → internal target).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetchImpl(currentUrl.href, {
        method: opts.method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...(opts.headers ?? {}),
        },
      });

      // Redirect?
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          // Dangling redirect — treat as the advertised status
          return { kind: "response", status: res.status };
        }
        redirectCount += 1;
        if (redirectCount > MAX_REDIRECTS) {
          return { kind: "error", message: `too many redirects (>${MAX_REDIRECTS})` };
        }
        try {
          currentUrl = new URL(location, currentUrl);
        } catch {
          return { kind: "error", message: `invalid redirect target: ${location}` };
        }
        if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
          return { kind: "error", message: `redirect to unsupported scheme: ${currentUrl.protocol}` };
        }
        if (isPrivateHost(currentUrl.hostname)) {
          return { kind: "error", message: `redirect to private host: ${currentUrl.hostname}` };
        }
        continue;
      }

      return { kind: "response", status: res.status };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      return { kind: "error", message: `timeout after ${opts.timeoutMs}ms` };
    }
    return { kind: "error", message };
  } finally {
    clearTimeout(timer);
  }
}

function statusToIssue(url: string, status: number): MediaValidationIssue | null {
  if (status >= 200 && status < 400) return null;
  return {
    url,
    reason: "http_error",
    message: `HTTP ${status}`,
    http_status: status,
  };
}
