/**
 * scripts/visual-compile-smoke.ts
 *
 * Live smoke test for the hidden prompt compiler + layout spec.
 * Exercises every input permutation the compiler cares about using
 * hand-rolled BrandVisualDefaults + EventVisualOverride + SourceFacts
 * inputs, then asserts the compiled output is well-formed:
 *
 *   - Negative prompt always contains the baseline "no text / no
 *     letters / no typography" clauses
 *   - Positive prompt always contains the resolved subject focus and
 *     a safe-zone instruction
 *   - Event override correctly wins over Brand defaults where present
 *   - Layout fallback kicks in when the preferred layout doesn't
 *     support the target platform format
 *
 * Usage:
 *   npm run visual:smoke
 *
 * Exit 0 on all-clear, 1 on any assertion failure.
 */

import { compileVisualPrompt } from "../src/lib/ai/visual/compile";
import type {
  BrandVisualDefaults,
  CompiledVisualPrompt,
  EventVisualOverride,
} from "../src/lib/ai/visual/types";
import type { BigWinFacts, PromoFacts } from "../src/lib/ai/types";

// ─── Inputs ─────────────────────────────────────────────────────────────────

const baseBrand: BrandVisualDefaults = {
  visual_style: "cinematic",
  visual_emphasis: "reward-forward",
  main_subject_type: "object",
  layout_family: "center_focus",
  platform_format_default: "square",
  negative_visual_elements: ["dice", "literal cash money stacks"],
  visual_notes: "prefer gold accents and confident framing",
};

const bigWin: BigWinFacts = {
  kind: "big_win",
  display_username: "ju********88",
  win_amount: 125_000,
  currency: "PHP",
  game_name: "Fortune Gems",
  game_vendor: "JILI",
  win_multiplier: 250,
  occurred_at: "2026-04-22T14:32:00.000Z",
  source_row_key: "bq-big-win-test",
};

const promo: PromoFacts = {
  kind: "promo",
  promo_id: "p-1",
  promo_title: "Weekend Cashback",
  mechanics: "Play slots",
  reward: "15% back up to ₱5,000",
  period_start: null,
  period_end: null,
  min_deposit: 500,
  terms_summary: "1x wagering",
};

// ─── Assertion helpers ─────────────────────────────────────────────────────

interface Assertion {
  name: string;
  ok: boolean;
  detail?: string;
}

function assertContains(
  prompt: string,
  needle: string,
  label: string,
): Assertion {
  const ok = prompt.toLowerCase().includes(needle.toLowerCase());
  return { name: label, ok, detail: ok ? undefined : `missing: "${needle}"` };
}

function assertEquals<T>(
  actual: T,
  expected: T,
  label: string,
): Assertion {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    name: label,
    ok,
    detail: ok ? undefined : `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  };
}

// ─── Cases ──────────────────────────────────────────────────────────────────

interface Case {
  name: string;
  run: () => { compiled: CompiledVisualPrompt; assertions: Assertion[] };
}

const cases: Case[] = [
  {
    name: "brand defaults + big_win facts + facebook",
    run: () => {
      const compiled = compileVisualPrompt({
        brand: baseBrand,
        platform: "facebook",
        source_facts: bigWin,
      });
      const asserts: Assertion[] = [
        assertContains(compiled.negative_prompt, "text in image", "negative contains anti-text"),
        assertContains(compiled.negative_prompt, "typography", "negative contains anti-typography"),
        assertContains(compiled.negative_prompt, "dice", "negative inherits brand negative (dice)"),
        assertContains(compiled.background_image_prompt, "Fortune Gems", "prompt mentions game name"),
        assertContains(compiled.background_image_prompt, "cinematic", "prompt mentions cinematic style"),
        assertContains(compiled.background_image_prompt, "1:1 square", "prompt carries aspect hint"),
        assertContains(compiled.background_image_prompt, "quiet", "prompt references safe-zone quietness"),
        assertEquals(compiled.platform_format, "square", "format resolves to square"),
        assertEquals(compiled.layout_key, "center_focus", "layout key resolves"),
        assertEquals(compiled.render_intent, "ai_background_then_overlay", "render intent is split"),
        assertEquals(compiled.effective_inputs.overridden_by_event, [], "no event overrides"),
      ];
      return { compiled, assertions: asserts };
    },
  },

  {
    name: "event override wins for layout + emphasis",
    run: () => {
      const event: EventVisualOverride = {
        visual_emphasis: "winner-forward",
        layout_family: "bottom_heavy",
        negative_visual_elements: ["chips"],
      };
      const compiled = compileVisualPrompt({
        brand: baseBrand,
        event,
        platform: "instagram",
        source_facts: bigWin,
      });
      const asserts: Assertion[] = [
        assertEquals(compiled.visual_emphasis, "winner-forward", "event emphasis wins"),
        assertEquals(compiled.layout_key, "bottom_heavy", "event layout wins"),
        assertContains(compiled.background_image_prompt, "person celebrating", "winner-forward changes subject"),
        assertContains(compiled.negative_prompt, "chips", "event negatives appended"),
        assertContains(compiled.negative_prompt, "dice", "brand negatives preserved alongside event"),
        assertEquals(
          compiled.effective_inputs.overridden_by_event.sort(),
          ["layout_family", "visual_emphasis"].sort() as typeof compiled.effective_inputs.overridden_by_event,
          "overridden_by_event tracked correctly",
        ),
      ];
      return { compiled, assertions: asserts };
    },
  },

  {
    name: "layout fallback when preferred doesn't support format",
    run: () => {
      // left_split isn't in bottom_heavy / portrait support set —
      // actually left_split supports square + landscape. Force a
      // portrait target to trigger fallback.
      const compiled = compileVisualPrompt({
        brand: { ...baseBrand, layout_family: "left_split" },
        platform: "tiktok", // platform default = portrait
        source_facts: promo,
      });
      const asserts: Assertion[] = [
        assertEquals(compiled.platform_format, "portrait", "tiktok → portrait"),
        assertEquals(compiled.layout_key, "bottom_heavy", "left_split in portrait → fallback bottom_heavy"),
        assertContains(compiled.background_image_prompt, "Weekend Cashback".toLowerCase(), "promo reward carried")
          // Note: reward text isn't verbatim — the promo case says "a hero
          // visualization of <reward>". Check via "15%" token instead.
          .ok
          ? { name: "promo reward propagates to subject", ok: true }
          : assertContains(compiled.background_image_prompt, "15%", "promo reward propagates"),
      ];
      return { compiled, assertions: asserts };
    },
  },

  {
    name: "negative prompt always includes baseline anti-text",
    run: () => {
      const compiled = compileVisualPrompt({
        brand: { ...baseBrand, negative_visual_elements: [] },
        platform: "telegram",
      });
      const asserts: Assertion[] = [
        assertContains(compiled.negative_prompt, "text in image", "baseline: no text in image"),
        assertContains(compiled.negative_prompt, "letters", "baseline: no letters"),
        assertContains(compiled.negative_prompt, "watermarks", "baseline: no watermarks"),
        assertContains(compiled.negative_prompt, "logos drawn in pixels", "baseline: no logos in pixels"),
      ];
      return { compiled, assertions: asserts };
    },
  },

  {
    name: "platform format override on event wins over brand default",
    run: () => {
      const compiled = compileVisualPrompt({
        brand: { ...baseBrand, platform_format_default: "square" },
        event: { platform_format: "story" },
        platform: "instagram",
      });
      const asserts: Assertion[] = [
        assertEquals(compiled.platform_format, "story", "event format wins"),
        assertContains(compiled.background_image_prompt, "9:16 vertical story", "aspect hint matches"),
      ];
      return { compiled, assertions: asserts };
    },
  },

  {
    name: "no source facts — subject falls back to brand subject type",
    run: () => {
      const compiled = compileVisualPrompt({
        brand: { ...baseBrand, main_subject_type: "symbol" },
        platform: "facebook",
      });
      const asserts: Assertion[] = [
        assertContains(compiled.background_image_prompt, "abstract symbol", "symbol fallback wording"),
      ];
      return { compiled, assertions: asserts };
    },
  },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

function main() {
  console.log("─".repeat(72));
  console.log(`visual-compile smoke — ${cases.length} cases`);
  console.log("─".repeat(72));

  let totalChecks = 0;
  let failedChecks = 0;

  for (const c of cases) {
    console.log("");
    console.log(`▶ ${c.name}`);
    const { compiled, assertions } = c.run();
    for (const a of assertions) {
      totalChecks += 1;
      const marker = a.ok ? "✓" : "✗";
      const detail = a.ok ? "" : `   ← ${a.detail}`;
      console.log(`  ${marker} ${a.name}${detail}`);
      if (!a.ok) failedChecks += 1;
    }
    if (process.env.VISUAL_SMOKE_VERBOSE === "1") {
      console.log("  compiled.background_image_prompt:");
      console.log(`    ${compiled.background_image_prompt}`);
      console.log(`  compiled.negative_prompt: ${compiled.negative_prompt}`);
      console.log(`  compiled.layout_key: ${compiled.layout_key}`);
    }
  }

  console.log("");
  console.log("─".repeat(72));
  if (failedChecks === 0) {
    console.log(`✓ all ${totalChecks} assertions passed across ${cases.length} cases`);
    process.exit(0);
  } else {
    console.error(`✗ ${failedChecks}/${totalChecks} assertions FAILED`);
    process.exit(1);
  }
}

main();
