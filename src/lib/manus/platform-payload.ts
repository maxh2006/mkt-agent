// Platform-specific payload mapping for the Manus handoff layer.
//
// The dispatcher still operates generically at the delivery level — it
// claims a row, loads the approved parent Post, and hands off to
// `dispatchToManus()`. Between those last two steps, this module shapes
// the content into a **platform-aware publish payload** that Manus can
// route without re-deriving per-platform conventions from our generic
// content block.
//
// Design principles (see docs/00-architecture.md → "Manus platform
// payload mapping"):
//   - Generic envelope fields (post_id, delivery_id, brand, source,
//     retry_count, scheduled_for) live on `ManusDispatchPayload`, not
//     here.
//   - `ManusDispatchPayload.content` is kept flat (unchanged) for
//     backward safety — stub/dry-run and existing Manus-side readers
//     continue to work if they only consume `content`.
//   - This module produces the NEW `ManusDispatchPayload.publish_payload`
//     discriminated-union, which is where platform-specific fields
//     land.
//   - No character-count enforcement, no hashtag-count enforcement, no
//     media verification — all explicitly deferred. This module ONLY
//     shapes what's already approved; it never rewrites content.

import type { Platform } from "@/generated/prisma/enums";

/**
 * Fields pulled from the approved parent Post. All optional at the
 * source — mappers decide how to combine them, and emit `null` for
 * platform slots that are empty.
 */
export interface PublishPayloadSource {
  headline: string | null;
  caption: string | null;
  cta: string | null;
  banner_text: string | null;
  /** Pass-through reference only. Full media pipeline + public-URL
   *  verification is the next Manus hardening task. */
  image_prompt: string | null;
}

// ─── Per-platform payload interfaces ────────────────────────────────────────
//
// Each carries a `platform` discriminator matching the Prisma Platform
// enum so TypeScript can narrow via `switch`. Field naming leans toward
// what each platform's API calls the content (e.g. "tweet_text", "text")
// so Manus's platform routers don't have to re-key things. Fields stay
// nullable rather than omitted so the shape is stable across all posts
// for a given platform.

export interface FacebookPublishPayload {
  platform: "facebook";
  /** Main post body. Caption-focused platforms take whatever the AI
   *  layer produced as the caption first; falls back to headline. */
  primary_text: string | null;
  /** Useful when FB is used for ads-like posts. */
  headline: string | null;
  call_to_action: string | null;
  banner_text: string | null;
  image_prompt: string | null;
}

export interface InstagramPublishPayload {
  platform: "instagram";
  /** IG's primary field is "caption". */
  caption: string | null;
  call_to_action: string | null;
  banner_text: string | null;
  image_prompt: string | null;
}

export interface TwitterPublishPayload {
  platform: "twitter";
  /** X/Twitter: concise text. No char-count enforced here. */
  tweet_text: string | null;
  /** If present, operator/manus may choose to append; we don't merge. */
  call_to_action: string | null;
  /** Media prompt is pass-through; X treats images as attachments. */
  image_prompt: string | null;
  // Intentionally NO banner_text — X doesn't support text overlays on
  // post media the way FB/IG do. Banner copy, if present, should be
  // burnt into the media at render time.
}

export interface TikTokPublishPayload {
  platform: "tiktok";
  /** TikTok is media-first; the caption is supporting text. */
  caption: string | null;
  call_to_action: string | null;
  /** Banner copy is a useful overlay hint on the rendered video. */
  banner_text: string | null;
  /** TikTok media pipeline lives downstream — `image_prompt` is a
   *  narrative anchor here, not a final video URL. */
  image_prompt: string | null;
}

export interface TelegramPublishPayload {
  platform: "telegram";
  /** Telegram is text-forward; most posts are messages, not media. */
  text: string | null;
  /** Optional headline — Manus may bold it if parse_mode lands later. */
  headline: string | null;
  call_to_action: string | null;
  banner_text: string | null;
  image_prompt: string | null;
  // `parse_mode` is intentionally OMITTED in MVP — adding it would
  // assume our approved content is HTML- or Markdown-safe, which the
  // AI layer does not currently guarantee. Plain text is the safe
  // default.
}

export type PublishPayload =
  | FacebookPublishPayload
  | InstagramPublishPayload
  | TwitterPublishPayload
  | TikTokPublishPayload
  | TelegramPublishPayload;

// ─── Selector ───────────────────────────────────────────────────────────────

/**
 * Build a platform-shaped publish payload from the approved post
 * content. Pure, synchronous, no side effects. Emits a one-line
 * observability log to surface which fields were populated vs omitted
 * (useful for debugging "why is my X post empty?" style questions
 * without leaking content values).
 */
export function buildPublishPayload(
  platform: Platform,
  source: PublishPayloadSource,
  context?: { delivery_id?: string },
): PublishPayload {
  let payload: PublishPayload;

  switch (platform) {
    case "facebook":
      payload = mapFacebook(source);
      break;
    case "instagram":
      payload = mapInstagram(source);
      break;
    case "twitter":
      payload = mapTwitter(source);
      break;
    case "tiktok":
      payload = mapTiktok(source);
      break;
    case "telegram":
      payload = mapTelegram(source);
      break;
    default: {
      // Exhaustive switch. If a new Platform is added to the Prisma
      // enum, TypeScript will force us back here to add a mapper.
      const _exhaustive: never = platform;
      throw new Error(`Unmapped platform: ${_exhaustive as string}`);
    }
  }

  logPayloadShaping(payload, context?.delivery_id);
  return payload;
}

// ─── Per-platform mappers ───────────────────────────────────────────────────

function mapFacebook(s: PublishPayloadSource): FacebookPublishPayload {
  return {
    platform: "facebook",
    primary_text: firstNonEmpty(s.caption, s.headline),
    headline: s.headline,
    call_to_action: s.cta,
    banner_text: s.banner_text,
    image_prompt: s.image_prompt,
  };
}

function mapInstagram(s: PublishPayloadSource): InstagramPublishPayload {
  return {
    platform: "instagram",
    caption: firstNonEmpty(s.caption, s.headline),
    call_to_action: s.cta,
    banner_text: s.banner_text,
    image_prompt: s.image_prompt,
  };
}

function mapTwitter(s: PublishPayloadSource): TwitterPublishPayload {
  return {
    platform: "twitter",
    tweet_text: firstNonEmpty(s.caption, s.headline),
    call_to_action: s.cta,
    image_prompt: s.image_prompt,
  };
}

function mapTiktok(s: PublishPayloadSource): TikTokPublishPayload {
  return {
    platform: "tiktok",
    caption: firstNonEmpty(s.caption, s.headline),
    call_to_action: s.cta,
    banner_text: s.banner_text,
    image_prompt: s.image_prompt,
  };
}

function mapTelegram(s: PublishPayloadSource): TelegramPublishPayload {
  return {
    platform: "telegram",
    text: firstNonEmpty(s.caption, s.headline),
    headline: s.headline,
    call_to_action: s.cta,
    banner_text: s.banner_text,
    image_prompt: s.image_prompt,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick the first non-null, non-empty-after-trim value. Returns null if
 * none qualify. Trimming is check-only — the returned value retains
 * original whitespace so we don't silently mutate approved content.
 */
function firstNonEmpty(...values: Array<string | null>): string | null {
  for (const v of values) {
    if (v !== null && v.trim().length > 0) return v;
  }
  return null;
}

/**
 * One-line-per-dispatch log for ops visibility. Prints which payload
 * slots were populated (`present=`) vs intentionally left null
 * (`omitted=`). Deliberately keeps content values out of the log —
 * operators inspect actual content via the Delivery Status modal.
 */
function logPayloadShaping(payload: PublishPayload, delivery_id?: string): void {
  const entries = Object.entries(payload).filter(([k]) => k !== "platform");
  const present: string[] = [];
  const omitted: string[] = [];
  for (const [k, v] of entries) {
    if (v === null || v === undefined) omitted.push(k);
    else present.push(k);
  }

  const parts = [
    delivery_id ? `delivery=${delivery_id}` : null,
    `platform=${payload.platform}`,
    `mapper=${payload.platform}`,
    `present=${present.join(",") || "(none)"}`,
    `omitted=${omitted.join(",") || "(none)"}`,
  ].filter(Boolean);

  console.log(`[manus-payload] ${parts.join(" ")}`);
}
