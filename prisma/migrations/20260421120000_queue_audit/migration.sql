-- Add hot_games to PostType and SourceType enums
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction in Postgres.
-- Prisma migrate deploy runs each statement sequentially without wrapping enum changes in a transaction.
ALTER TYPE "PostType" ADD VALUE IF NOT EXISTS 'hot_games';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'hot_games';

-- Add rejection / approval metadata columns to posts
ALTER TABLE "posts" ADD COLUMN "rejected_at" TIMESTAMP(3);
ALTER TABLE "posts" ADD COLUMN "rejected_by" TEXT;
ALTER TABLE "posts" ADD COLUMN "approved_at" TIMESTAMP(3);

-- FK for rejected_by -> users(id)
ALTER TABLE "posts" ADD CONSTRAINT "posts_rejected_by_fkey"
  FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
