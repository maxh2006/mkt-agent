-- Add nullable `image_url` column to `posts`.
--
-- Activates the pre-dispatch media validation layer shipped in the
-- previous Manus hardening task (see src/lib/manus/media-validation.ts).
-- `image_prompt` stays as the narrative AI input; `image_url` is the
-- public media reference Manus publishes. MVP shape is a single
-- optional URL per post — richer media arrays/objects can evolve
-- later without another migration.

ALTER TABLE "posts" ADD COLUMN "image_url" TEXT;
