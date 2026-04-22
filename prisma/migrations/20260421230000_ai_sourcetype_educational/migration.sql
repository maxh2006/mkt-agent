-- Add `educational` to SourceType enum so AI-generated educational drafts
-- persist with a proper source label (matches PostType, which already
-- has `educational`). Part of Phase 4 AI content generator groundwork.

ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'educational';
