-- Add nullable `visual_settings_json` column to `events`.
--
-- Activates the Event Visual Override UI (Phase 4 follow-up #2). The
-- column carries the operator-authored partial override block — only
-- fields the operator wants to differ from the Brand defaults are
-- present. Null / absent rows behave as "no override" — the visual
-- compiler at `src/lib/ai/visual/compile.ts` falls through to the
-- Brand's `design_settings_json.visual_defaults` field-by-field.
--
-- Shape contract: see `eventVisualOverrideSchema` in
-- `src/lib/ai/visual/validation.ts`. `visual_style` is intentionally
-- omitted from the override layer — stays brand-level for
-- cross-event consistency across a brand's event lineup.

ALTER TABLE "events" ADD COLUMN "visual_settings_json" JSONB;
