import type { StructuredPrompt } from "./prompt-builder";
import type { GeneratedSample, NormalizedGenerationInput } from "./types";

/**
 * AI client boundary.
 *
 * Current state: **dry-run stub**. `generateSamples()` returns
 * deterministic placeholder samples shaped exactly like a real provider
 * response. This lets the rest of the pipeline (prompt builder, orchestrator,
 * queue inserter) be exercised end-to-end with no provider account and no
 * cost, and makes the event-drafts route immediately useful again.
 *
 * Wire-up of a real provider (Anthropic / OpenAI / local model) is a
 * single-function change behind an env flag:
 *   AI_PROVIDER=stub         → stub samples (default)
 *   AI_PROVIDER=anthropic    → TODO: call @anthropic-ai/sdk (future task)
 *
 * Locking the image-generation model is explicitly out of scope for
 * Phase 4; every sample carries an `image_prompt` string that a future
 * image provider can consume.
 */

export interface GenerateSamplesResult {
  samples: GeneratedSample[];
  provider: string;
  dry_run: boolean;
}

export async function generateSamples(args: {
  input: NormalizedGenerationInput;
  prompt: StructuredPrompt;
}): Promise<GenerateSamplesResult> {
  const provider = (process.env.AI_PROVIDER ?? "stub").toLowerCase();

  switch (provider) {
    case "stub":
    default:
      return stubProvider(args);
  }
}

// ─── Dry-run stub ───────────────────────────────────────────────────────────

function stubProvider(args: {
  input: NormalizedGenerationInput;
  prompt: StructuredPrompt;
}): GenerateSamplesResult {
  const { input } = args;
  const samples: GeneratedSample[] = [];
  for (let i = 0; i < input.sample_count; i++) {
    samples.push(stubSample(input, i));
  }
  console.log(
    `[ai-generator] stub provider produced ${samples.length} sample(s) for source=${input.source_type} brand=${input.brand.id} platform=${input.platform}`,
  );
  return { samples, provider: "stub", dry_run: true };
}

function stubSample(input: NormalizedGenerationInput, index: number): GeneratedSample {
  const facts = input.source_facts;
  const brand = input.brand.name;
  const marker = `(STUB sample ${index + 1} of ${input.sample_count})`;

  switch (facts.kind) {
    case "big_win":
      return {
        headline: `${brand}: ${facts.display_username} just hit ${facts.currency} ${facts.win_amount.toLocaleString()}!`,
        caption:
          `${marker}\nHuge win alert on ${facts.game_name}${facts.game_vendor ? ` by ${facts.game_vendor}` : ""}! ${facts.display_username} bagged ${facts.currency} ${facts.win_amount.toLocaleString()}${facts.win_multiplier ? ` with a ${facts.win_multiplier}x multiplier` : ""}. Could you be next?`,
        cta: stubCta(input, "Play now"),
        banner_text: `${facts.currency} ${facts.win_amount.toLocaleString()} WIN`,
        image_prompt: `Celebration-themed image for ${brand}. ${facts.game_name} game artwork in the background, confetti, bold gold "${facts.currency} ${facts.win_amount.toLocaleString()}" overlay, brand color accents (${input.brand.primary_color ?? "brand primary"}, ${input.brand.accent_color ?? "brand accent"}). Mood: exciting, premium, trustworthy.`,
      };
    case "promo":
      return {
        headline: `${brand}: ${facts.promo_title}`,
        caption: `${marker}\n${facts.mechanics}\n\nReward: ${facts.reward}${facts.period_end ? `. Ends ${facts.period_end}.` : ""}`,
        cta: stubCta(input, "Join the promo"),
        banner_text: facts.reward,
        image_prompt: `Promotional banner for ${brand}. Bold typographic treatment of the promo title "${facts.promo_title}". Brand colors (${input.brand.primary_color ?? "primary"}, ${input.brand.accent_color ?? "accent"}). Clean, confident, premium.`,
      };
    case "hot_games": {
      const top = facts.ranked_games[0];
      return {
        headline: `${brand}: Top games for ${facts.time_slot_summary}`,
        caption:
          `${marker}\nTonight's hottest picks:\n${facts.ranked_games
            .slice(0, 5)
            .map((g) => `${g.rank}. ${g.game_name}`)
            .join("\n")}\n\nGet in on the action before the slot window closes.`,
        cta: stubCta(input, "Play the hot list"),
        banner_text: top ? `#1 ${top.game_name}` : null,
        image_prompt: `Leaderboard-style image for ${brand} with 5 ranked game tiles. Prominent #1 spot showing "${top?.game_name ?? "top game"}". Brand colors (${input.brand.primary_color ?? "primary"}, ${input.brand.accent_color ?? "accent"}). Mood: electric, competitive, timely.`,
      };
    }
    case "event":
      return {
        headline: `${brand}: ${facts.title}`,
        caption: `${marker}\n${facts.objective ?? facts.theme ?? "Join the campaign."}${facts.reward ? `\n\nReward: ${facts.reward}` : ""}${facts.rules ? `\n\nHow it works: ${facts.rules}` : ""}`,
        cta: stubCta(input, facts.target_audience ? `Join now, ${facts.target_audience.split(",")[0]?.toLowerCase() ?? "friend"}` : "Join now"),
        banner_text: facts.reward ?? null,
        image_prompt: `Event-themed image for ${brand} built around the theme "${facts.theme ?? facts.title}". Brand colors (${input.brand.primary_color ?? "primary"}, ${input.brand.accent_color ?? "accent"}). Mood matches the event objective: ${facts.objective ?? "drive participation"}.`,
      };
    case "educational":
      return {
        headline: `${brand}: ${facts.topic.split(" — ")[0] ?? facts.topic}`,
        caption:
          `${marker}\n${facts.key_point}\n\nAngle: ${facts.angle}`,
        cta: stubCta(input, facts.cta_goal),
        banner_text: null,
        image_prompt: `Calm, educational illustration for ${brand}. Supportive imagery matching the key point: "${facts.key_point}". Brand colors (${input.brand.primary_color ?? "primary"}, ${input.brand.accent_color ?? "accent"}). Mood: reassuring, practical, premium.`,
      };
  }
}

function stubCta(input: NormalizedGenerationInput, fallback: string): string {
  const ctaSource = input.effective.cta_style ?? "";
  if (!ctaSource) return fallback;
  // If the brand's cta_style enum value is one of our known shorthand
  // keys we still return the fallback — the stub doesn't pretend to be a
  // real copywriter. Real providers will actually use the style field.
  return fallback;
}
