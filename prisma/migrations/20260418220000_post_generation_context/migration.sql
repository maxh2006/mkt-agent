-- Add generation_context_json to posts for per-draft automation context
-- (e.g. frozen Hot Games snapshot so Content Queue edits reuse the same batch)
ALTER TABLE "posts" ADD COLUMN "generation_context_json" JSONB;
